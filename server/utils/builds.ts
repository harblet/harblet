import { createHash } from 'node:crypto'
import type { services } from '../database/schema'

interface Job extends KubeObject {
  status?: { conditions?: { type: string, status: string, reason?: string }[] }
}

interface ContainerStatus {
  name: string
  state: { waiting?: { reason: string, message?: string }, terminated?: { message?: string } }
}

interface PodList {
  items: {
    metadata: { name: string }
    status: { initContainerStatuses?: ContainerStatus[], containerStatuses?: ContainerStatus[] }
  }[]
}

export type BuildResult =
  | { status: 'succeeded', imageDigest: string, ports: number[] }
  | { status: 'failed', error: string }

const railpack = {
  version: '0.43.0',
  arm64: '732ece14eb4f4676a43ebba19431f954edf7b130acb76159ef0f2ff86ac42ac9',
  x86_64: '248a8f60f36854aabed6124113631078a802de3461660855fc4de9c26065c1fb'
}

const timeoutMinutes = 30
const failureReasons = ['ImagePullBackOff', 'InvalidImageName', 'CreateContainerConfigError']

const cloneScript = `set -eu
echo "Cloning $REPOSITORY (branch $BRANCH)\${CONNECTION:+ with access from $CONNECTION}"
git -c protocol.allow=never -c protocol.https.allow=always clone --depth 1 --branch "$BRANCH" --single-branch --no-tags -- "$REPOSITORY" /workspace/source
git -C /workspace/source log -1 --format='%H%n%s' > /dev/termination-log
git -C /workspace/source log -1 --format='Commit %h: %s'`

const sourceScript = `inside() {
  case "$1/" in
    /workspace/source/*) ;;
    *) echo "$2 points outside the repository." >&2; exit 1 ;;
  esac
}
if ! cd -P "/workspace/source/$ROOT_DIRECTORY" 2> /dev/null; then
  echo "There is no directory $ROOT_DIRECTORY in the repository." >&2
  exit 1
fi
inside "$(pwd -P)" "The directory $ROOT_DIRECTORY"
dockerfile=\${DOCKERFILE:-Dockerfile}
dockerfiles=
if [ -f "$dockerfile" ]; then
  dockerfiles=$(cd -P "$(dirname "$dockerfile")" && pwd -P)
  inside "$dockerfiles" "$dockerfile"
elif [ -n "$DOCKERFILE" ]; then
  echo "There is no $DOCKERFILE in the repository." >&2
  exit 1
fi`

const prepareScript = `set -eu
${sourceScript}
if [ -n "$dockerfiles" ]; then
  echo "Building with $dockerfile"
  exit 0
fi
echo "No Dockerfile found, building with Railpack"
case "$(uname -m)" in
  aarch64) arch=arm64 checksum=${railpack.arm64} ;;
  x86_64) arch=x86_64 checksum=${railpack.x86_64} ;;
  *) echo "Railpack doesn't support $(uname -m)." >&2; exit 1 ;;
esac
wget -q -O /tmp/railpack.tar.gz "https://github.com/railwayapp/railpack/releases/download/v${railpack.version}/railpack-v${railpack.version}-$arch-unknown-linux-musl.tar.gz"
if ! echo "$checksum  /tmp/railpack.tar.gz" | sha256sum -c -s; then
  echo "The Railpack download doesn't match its checksum." >&2
  exit 1
fi
mkdir -p /tmp/bin && tar -xzf /tmp/railpack.tar.gz -C /tmp/bin railpack
mkdir -p /workspace/plan
set --
for file in /variables/*; do
  if [ -f "$file" ]; then set -- "$@" --env "\${file##*/}=$(cat "$file")"; fi
done
/tmp/bin/railpack prepare . --error-missing-start --plan-out /workspace/plan/railpack-plan.json --info-out /workspace/plan/railpack-info.json "$@"`

const buildScript = `set -eu
${sourceScript}
attempt=1
until buildctl debug workers > /dev/null 2>&1; do
  if [ "$attempt" -ge 30 ]; then
    echo "BuildKit is not reachable." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done
set --
for file in /variables/*; do
  if [ -f "$file" ]; then set -- "$@" --secret "id=\${file##*/},src=$file"; fi
done
if [ -n "$dockerfiles" ]; then
  for file in /variables/*; do
    if [ -f "$file" ]; then set -- "$@" --opt "build-arg:\${file##*/}=$(cat "$file")"; fi
  done
  set -- "$@" --frontend dockerfile.v0 --local context=. --local "dockerfile=$dockerfiles" --opt "filename=$(basename "$dockerfile")"
else
  set -- "$@" --frontend gateway.v0 --opt source=ghcr.io/railwayapp/railpack-frontend:v${railpack.version} --local context=. --local dockerfile=/workspace/plan --opt "build-arg:cache-key=$CACHE_KEY" --opt "build-arg:secrets-hash=$SECRETS_HASH"
fi
buildctl build --progress=plain "$@" --output "type=image,name=$IMAGE,push=true,registry.insecure=true" --metadata-file /tmp/metadata.json
sed -n 's/.*"containerimage.digest": *"\\([^"]*\\)".*/\\1/p' /tmp/metadata.json > /dev/termination-log
config=$(sed -n 's/.*"containerimage.config.digest": *"\\([^"]*\\)".*/\\1/p' /tmp/metadata.json)
auth=$(sed -n 's/.*"auth": *"\\([^"]*\\)".*/\\1/p' /docker/config.json)
repository=\${IMAGE#*/}
if wget -q -T 10 -O /tmp/config.json --header "Authorization: Basic $auth" "http://\${IMAGE%%/*}/v2/\${repository%:*}/blobs/$config"; then
  grep -o '"[0-9]*/tcp": *{' /tmp/config.json | tr -cd '0-9\\n' >> /dev/termination-log
else
  echo "Couldn't read the ports the image exposes."
fi`

export function builtImage(namespace: string, hostname: string) {
  return `${registryHost}/${namespace}/${hostname}`
}

export async function createBuild(
  id: string,
  service: typeof services.$inferSelect,
  namespace: string,
  variables: { key: string, value: string }[]
) {
  const name = `build-${id}`
  const labels = { 'app.kubernetes.io/managed-by': 'harblet', 'harblet.com/component': 'build', 'harblet.com/deployment': id }
  const sorted = variables.toSorted((a, b) => a.key.localeCompare(b.key))
  const secretsHash = createHash('sha256').update(sorted.map(({ key, value }) => `${key}=${value}\n`).join('')).digest('hex')
  const connection = service.gitConnectionId
    ? await db.query.gitConnections.findFirst({ where: { id: service.gitConnectionId } })
    : undefined

  if (connection) {
    const { username, password } = await cloneCredentials(connection, service.repository!)
    await kubeApply({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: `${name}-clone`, namespace: systemNamespace, labels },
      type: 'Opaque',
      data: { header: Buffer.from(`Authorization: Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`).toString('base64') }
    })
  }

  await kubeApply({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name, namespace: systemNamespace, labels },
    type: 'Opaque',
    data: Object.fromEntries(sorted.map(({ key, value }) => [key, Buffer.from(value).toString('base64')]))
  })

  await kubeApply({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: systemNamespace, labels },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: timeoutMinutes * 60,
      ttlSecondsAfterFinished: 24 * 60 * 60,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          enableServiceLinks: false,
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000 },
          initContainers: [{
            name: 'clone',
            image: 'alpine/git:v2.54.0',
            command: ['sh', '-c', cloneScript],
            env: [
              { name: 'HOME', value: '/tmp' },
              { name: 'GIT_TERMINAL_PROMPT', value: '0' },
              { name: 'REPOSITORY', value: service.repository! },
              { name: 'BRANCH', value: service.branch! },
              ...(connection
                ? [
                    { name: 'CONNECTION', value: `${connection.provider === 'gitlab' ? 'GitLab access token' : 'GitHub App'} ${connection.name}` },
                    { name: 'GIT_CONFIG_COUNT', value: '1' },
                    { name: 'GIT_CONFIG_KEY_0', value: `http.${new URL(service.repository!).origin}/.extraHeader` },
                    { name: 'GIT_CONFIG_VALUE_0', valueFrom: { secretKeyRef: { name: `${name}-clone`, key: 'header' } } }
                  ]
                : [])
            ],
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }]
          }, {
            name: 'prepare',
            image: 'moby/buildkit:v0.34.2',
            command: ['sh', '-c', prepareScript],
            env: [
              { name: 'HOME', value: '/tmp' },
              { name: 'ROOT_DIRECTORY', value: service.rootDirectory ?? '' },
              { name: 'DOCKERFILE', value: service.dockerfilePath ?? '' }
            ],
            volumeMounts: [
              { name: 'workspace', mountPath: '/workspace' },
              { name: 'variables', mountPath: '/variables', readOnly: true }
            ]
          }],
          containers: [{
            name: 'build',
            image: 'moby/buildkit:v0.34.2',
            command: ['sh', '-c', buildScript],
            env: [
              { name: 'HOME', value: '/tmp' },
              { name: 'BUILDKIT_HOST', value: `tcp://buildkit.${systemNamespace}.svc.cluster.local:1234` },
              { name: 'DOCKER_CONFIG', value: '/docker' },
              { name: 'ROOT_DIRECTORY', value: service.rootDirectory ?? '' },
              { name: 'DOCKERFILE', value: service.dockerfilePath ?? '' },
              { name: 'IMAGE', value: `${builtImage(namespace, service.hostname)}:${id}` },
              { name: 'CACHE_KEY', value: service.id },
              { name: 'SECRETS_HASH', value: secretsHash }
            ],
            volumeMounts: [
              { name: 'workspace', mountPath: '/workspace' },
              { name: 'docker', mountPath: '/docker', readOnly: true },
              { name: 'variables', mountPath: '/variables', readOnly: true }
            ]
          }],
          volumes: [
            { name: 'workspace', emptyDir: {} },
            { name: 'docker', secret: { secretName: 'registry-push', items: [{ key: 'config.json', path: 'config.json' }] } },
            { name: 'variables', secret: { secretName: name } }
          ]
        }
      }
    }
  })
}

export async function inspectBuild(id: string): Promise<{ logs: string, commit?: { commitSha: string, commitMessage: string }, result?: BuildResult }> {
  const job = await kubeFetch<Job>(`/apis/batch/v1/namespaces/${systemNamespace}/jobs/build-${id}`).catch((error) => {
    if (error instanceof KubeError && error.statusCode === 404) {
      return undefined
    }
    throw error
  })
  if (!job) {
    return { logs: '', result: { status: 'failed', error: 'The build job was removed.' } }
  }

  const query = new URLSearchParams({ labelSelector: `harblet.com/deployment=${id}` })
  const { items: [pod] } = await kubeFetch<PodList>(`/api/v1/namespaces/${systemNamespace}/pods?${query}`)
  const parts = pod
    ? await Promise.all(['clone', 'prepare', 'build'].map(container => kubeRequest(`/api/v1/namespaces/${systemNamespace}/pods/${pod.metadata.name}/log?container=${container}`)
        .then(response => response.text())
        .catch(() => '')))
    : []
  const logs = parts.join('')

  const statuses = [...pod?.status.initContainerStatuses ?? [], ...pod?.status.containerStatuses ?? []]
  const message = (name: string) => statuses.find(status => status.name === name)?.state.terminated?.message?.trim() ?? ''
  const [commitSha, commitMessage = ''] = message('clone').split('\n')
  const commit = commitSha ? { commitSha, commitMessage } : undefined

  const conditions = job.status?.conditions?.filter(condition => condition.status === 'True') ?? []
  const failed = conditions.find(condition => condition.type === 'Failed')
  if (failed) {
    const error = failed.reason === 'DeadlineExceeded' ? `The build took longer than ${timeoutMinutes} minutes.` : 'The build failed. See the build logs.'
    return { logs, commit, result: { status: 'failed', error } }
  }

  const waiting = statuses.map(status => status.state.waiting).find(waiting => waiting && failureReasons.includes(waiting.reason))
  if (waiting) {
    return { logs, commit, result: { status: 'failed', error: waiting.message ?? waiting.reason } }
  }

  if (conditions.some(condition => condition.type === 'Complete')) {
    const [imageDigest = '', ...ports] = message('build').split('\n')
    if (!imageDigest.startsWith('sha256:')) {
      return { logs, commit, result: { status: 'failed', error: 'The build didn\'t report an image digest.' } }
    }
    return { logs, commit, result: { status: 'succeeded', imageDigest, ports: ports.map(Number).filter(Boolean).toSorted((a, b) => a - b) } }
  }

  return { logs, commit }
}

export async function deleteBuild(id: string) {
  await kubeDelete(`/apis/batch/v1/namespaces/${systemNamespace}/jobs/build-${id}?propagationPolicy=Background`)
  await kubeDelete(`/api/v1/namespaces/${systemNamespace}/secrets/build-${id}`)
  await kubeDelete(`/api/v1/namespaces/${systemNamespace}/secrets/build-${id}-clone`)
}
