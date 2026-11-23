import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'

interface Node {
  metadata: { name: string, creationTimestamp: string, labels: Record<string, string> }
  spec: { unschedulable?: boolean }
  status: {
    addresses: { type: string, address: string }[]
    capacity: { cpu: string, memory: string }
    conditions: { type: string, status: string }[]
    nodeInfo: { kubeletVersion: string, osImage: string }
  }
}

interface Secret {
  data: Record<string, string>
}

interface PersistentVolumeClaimList {
  items: { metadata: { namespace: string, name: string, annotations?: Record<string, string> } }[]
}

interface ContainerStatus {
  state: { waiting?: { reason: string, message?: string } }
}

interface PodList {
  items: {
    metadata: { name: string, namespace: string, labels?: Record<string, string> }
    status?: { initContainerStatuses?: ContainerStatus[], containerStatuses?: ContainerStatus[] }
  }[]
}

interface PlanList {
  items: {
    metadata: { name: string }
    spec: { version: string }
    status?: { conditions?: { type: string, reason?: string, message?: string }[] }
  }[]
}

const logger = useLogger('utils:servers')

const firstServerLabel = 'node-role.kubernetes.io/control-plane'
const serverPlan = 'k3s-server'
const agentPlan = 'k3s-agent'
const failureReasons = ['ImagePullBackOff', 'InvalidImageName']
const tokenLifetime = 24 * 60 * 60 * 1000
const tokenAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
const units: Record<string, number> = { n: 1e-9, u: 1e-6, m: 1e-3, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3 }

export function parseQuantity(quantity: string) {
  const [, value, unit] = quantity.match(/^([\d.]+)(\D*)$/)!
  return Number(value) * (units[unit!] ?? 1)
}

function isFirstServer(node: Node) {
  return firstServerLabel in node.metadata.labels
}

function nodeAddress(node: Node) {
  return node.status.addresses.find(address => address.type === 'InternalIP')?.address
}

function notFound(error: unknown) {
  if (error instanceof KubeError && error.statusCode === 404) {
    return undefined
  }
  throw error
}

function randomString(length: number) {
  return Array.from({ length }, () => tokenAlphabet[randomInt(tokenAlphabet.length)]).join('')
}

export async function listServers() {
  const [nodes, current, plans, pods] = await Promise.all([
    kubeFetch<{ items: Node[] }>('/api/v1/nodes'),
    currentServerMetrics(),
    kubeFetch<PlanList>(`/apis/upgrade.cattle.io/v1/namespaces/${systemNamespace}/plans`).catch(() => ({ items: [] })),
    kubeFetch<PodList>(`/api/v1/namespaces/${systemNamespace}/pods?${new URLSearchParams({ labelSelector: 'upgrade.cattle.io/node' })}`)
  ])
  return nodes.items
    .map((node) => {
      const used = current.get(node.metadata.name)
      const first = isFirstServer(node)
      const version = node.status.nodeInfo.kubeletVersion
      const plan = plans.items.find(plan => plan.metadata.name === (first ? serverPlan : agentPlan))
      const waiting = pods.items
        .filter(pod => pod.metadata.labels?.['upgrade.cattle.io/node'] === node.metadata.name)
        .flatMap(pod => [...pod.status?.initContainerStatuses ?? [], ...pod.status?.containerStatuses ?? []])
        .map(status => status.state.waiting)
        .find(waiting => waiting && failureReasons.includes(waiting.reason))
      return {
        name: node.metadata.name,
        first,
        ready: node.status.conditions.some(condition => condition.type === 'Ready' && condition.status === 'True'),
        address: nodeAddress(node),
        version,
        upgrade: plan && isNewer(plan.spec.version, version)
          ? {
              version: plan.spec.version,
              error: waiting?.message
                ?? waiting?.reason
                ?? plan.status?.conditions?.find(condition => condition.type === 'Complete' && condition.reason === 'JobFailed')?.message
                ?? null
            }
          : null,
        os: node.status.nodeInfo.osImage,
        cpu: { total: parseQuantity(node.status.capacity.cpu), used: used?.cpu ?? null },
        memory: { total: parseQuantity(node.status.capacity.memory), used: used?.memory ?? null },
        createdAt: node.metadata.creationTimestamp
      }
    })
    .sort((a, b) => Number(b.first) - Number(a.first) || a.createdAt.localeCompare(b.createdAt))
}

function upgradePlan(name: string, version: string, spec: Record<string, unknown>) {
  return {
    apiVersion: 'upgrade.cattle.io/v1',
    kind: 'Plan',
    metadata: {
      name,
      namespace: systemNamespace,
      labels: { 'app.kubernetes.io/name': 'k3s-upgrade', 'app.kubernetes.io/managed-by': 'harblet' }
    },
    spec: {
      version,
      concurrency: 1,
      jobActiveDeadlineSecs: 0,
      serviceAccountName: 'system-upgrade-controller',
      upgrade: { image: 'rancher/k3s-upgrade' },
      ...spec
    }
  }
}

export async function upgradeServers() {
  const { items } = await kubeFetch<{ items: Node[] }>('/api/v1/nodes')
  if (!isNewer(k3sVersion, items.find(isFirstServer)!.status.nodeInfo.kubeletVersion)) {
    return
  }
  logger.info(`Upgrading k3s to ${k3sVersion}`)
  await kubeDelete(`/apis/batch/v1/namespaces/${systemNamespace}/jobs?${new URLSearchParams({
    labelSelector: `upgrade.cattle.io/plan,upgrade.cattle.io/version!=${k3sVersion.replace('+', '-')}`,
    propagationPolicy: 'Background'
  })}`)
  const plans = [
    upgradePlan(serverPlan, k3sVersion, {
      nodeSelector: { matchExpressions: [{ key: firstServerLabel, operator: 'Exists' }] }
    }),
    upgradePlan(agentPlan, k3sVersion, {
      nodeSelector: { matchExpressions: [{ key: firstServerLabel, operator: 'DoesNotExist' }] },
      prepare: { image: 'rancher/k3s-upgrade', args: ['prepare', serverPlan] }
    })
  ]
  for (const plan of plans) {
    while (true) {
      try {
        await kubeApply(plan)
        break
      } catch (error) {
        if (!(error instanceof KubeError && error.statusCode === 404)) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }
}

export async function createJoinToken() {
  const id = randomString(6)
  const secret = randomString(16)
  const expiresAt = new Date(Date.now() + tokenLifetime)
  await kubeApply({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: `bootstrap-token-${id}`, namespace: 'kube-system' },
    type: 'bootstrap.kubernetes.io/token',
    stringData: {
      'token-id': id,
      'token-secret': secret,
      'expiration': expiresAt.toISOString(),
      'usage-bootstrap-authentication': 'true',
      'usage-bootstrap-signing': 'true',
      'auth-extra-groups': 'system:bootstrappers:k3s:default-node-token',
      'description': 'Harblet join token'
    }
  })
  return { token: `${id}.${secret}`, expiresAt }
}

export async function renderJoinScript(token: string) {
  const [id, secret] = token.split('.') as [string, string]
  const bootstrap = await kubeFetch<Secret>(`/api/v1/namespaces/kube-system/secrets/bootstrap-token-${id}`).catch(notFound)
  if (!bootstrap) {
    return
  }
  const value = (key: string) => Buffer.from(bootstrap.data[key] ?? '', 'base64')
  if (!timingSafeEqual(value('token-secret'), Buffer.from(secret)) || new Date(value('expiration').toString()) <= new Date()) {
    return
  }

  const [nodes, pull, ca] = await Promise.all([
    kubeFetch<{ items: Node[] }>('/api/v1/nodes'),
    kubeFetch<Secret>(`/api/v1/namespaces/${systemNamespace}/secrets/registry-pull`),
    readFile(`${useRuntimeConfig().kubernetes.serviceAccountDir}/ca.crt`)
  ])
  const first = nodes.items.find(isFirstServer)!
  const password = Buffer.from(pull.data.password!, 'base64').toString()
  const hash = createHash('sha256').update(ca).digest('hex')

  return `#!/bin/sh
set -eu

if command -v k3s >/dev/null 2>&1; then
  echo "k3s is already installed on this server, so it can't be added." >&2
  exit 1
fi

mkdir -p /etc/rancher/k3s
cat > /etc/rancher/k3s/config.yaml <<'EOF'
kube-proxy-arg: nodeport-addresses=127.0.0.0/8
EOF
cat > /etc/rancher/k3s/registries.yaml <<'EOF'
mirrors:
  "${registryHost}":
    endpoint:
      - http://127.0.0.1:30500
configs:
  "127.0.0.1:30500":
    auth:
      username: pull
      password: ${JSON.stringify(password)}
EOF
chmod 600 /etc/rancher/k3s/registries.yaml

cat > /etc/sysctl.d/90-harblet.conf <<'EOF'
kernel.apparmor_restrict_unprivileged_unconfined = 0
EOF
sysctl -e -q -p /etc/sysctl.d/90-harblet.conf

installer=$(mktemp)
curl -sfL https://get.k3s.io -o "$installer"
INSTALL_K3S_VERSION='${first.status.nodeInfo.kubeletVersion}' K3S_URL='https://${nodeAddress(first)}:6443' K3S_TOKEN='K10${hash}::${token}' sh "$installer"
rm -f "$installer"
`
}

export async function removeServer(name: string) {
  const node = await kubeFetch<Node>(`/api/v1/nodes/${name}`).catch(notFound)
  if (!node) {
    throw createError({ statusCode: 404, message: 'Server not found.' })
  }
  if (isFirstServer(node)) {
    throw createError({ statusCode: 403, message: 'The first server can\'t be removed.' })
  }

  const cordon = (unschedulable: boolean) => kubeFetch(`/api/v1/nodes/${name}`, { method: 'PATCH', body: { spec: { unschedulable } }, contentType: 'application/merge-patch+json' })
  await cordon(true)

  try {
    const { items } = await kubeFetch<PersistentVolumeClaimList>('/api/v1/persistentvolumeclaims')
    const claims = items
      .filter(claim => claim.metadata.annotations?.['volume.kubernetes.io/selected-node'] === name)
      .map(claim => claim.metadata)
    if (claims.length) {
      const projects = await db.query.projects.findMany({
        where: { namespace: { in: claims.map(claim => claim.namespace) } },
        columns: { name: true, namespace: true },
        with: { services: { columns: { name: true, hostname: true } } }
      })
      const names = projects.flatMap(project => project.services
        .filter(service => claims.some(claim => claim.namespace === project.namespace && claim.name.includes(`-${service.hostname}-`)))
        .map(service => `${service.name} (${project.name})`))
      throw createError({
        statusCode: 409,
        message: names.length
          ? `This server stores the data of ${names.join(', ')}. Delete ${names.length === 1 ? 'that service' : 'those services'} first.`
          : 'This server still stores volumes. Try again in a moment.'
      })
    }

    const pods = await kubeFetch<PodList>(`/api/v1/pods?${new URLSearchParams({ fieldSelector: `spec.nodeName=${name}` })}`)
    await Promise.all(pods.items.map(pod => kubeFetch(`/api/v1/namespaces/${pod.metadata.namespace}/pods/${pod.metadata.name}/eviction`, {
      method: 'POST',
      body: { apiVersion: 'policy/v1', kind: 'Eviction', metadata: { name: pod.metadata.name, namespace: pod.metadata.namespace } }
    }).catch(notFound)))
    await kubeDelete(`/api/v1/namespaces/kube-system/secrets?${new URLSearchParams({ fieldSelector: 'type=bootstrap.kubernetes.io/token' })}`)
    await kubeDelete(`/api/v1/nodes/${name}`)
  } catch (error) {
    if (!node.spec.unschedulable) {
      await cordon(false)
    }
    throw error
  }
  await deleteServerMetrics(name)
}
