import { z } from 'zod'

interface Deployment {
  spec: { template: { spec: { containers: { name: string, image: string }[] } } }
}

interface Job {
  status?: { conditions?: { type: string, status: string, reason?: string }[] }
}

interface PodList {
  items: { status: { containerStatuses?: { state: { waiting?: { reason: string, message?: string } } }[] } }[]
}

const logger = useLogger('utils:updates')

const releaseSchema = z.object({
  tag_name: z.string().regex(/^v\d+\.\d+\.\d+$/),
  html_url: z.url({ protocol: /^https$/ })
})

const checkInterval = 60 * 60 * 1000
const pullTimeoutMinutes = 10
const failureReasons = ['ImagePullBackOff', 'InvalidImageName']
const deploymentPath = `/apis/apps/v1/namespaces/${systemNamespace}/deployments/harblet`

let latest: { version: string, url: string, checkedAt: number } | undefined
let update: { version: string, error?: string } | undefined

async function latestRelease() {
  if (latest && Date.now() - latest.checkedAt < checkInterval) {
    return latest
  }
  try {
    const release = releaseSchema.parse(await $fetch(useRuntimeConfig().releaseUrl, {
      headers: { 'accept': 'application/vnd.github+json', 'user-agent': 'harblet' },
      timeout: 5000
    }))
    latest = { version: release.tag_name.slice(1), url: release.html_url, checkedAt: Date.now() }
    return latest
  } catch (error) {
    logger.warn(error)
  }
}

export function isNewer(version: string, current: string) {
  const parts = current.match(/\d+/g)!.map(Number)
  for (const [index, part] of version.match(/\d+/g)!.map(Number).entries()) {
    if (part !== parts[index]) {
      return part > parts[index]!
    }
  }
  return false
}

export async function getUpdate() {
  const { version } = useRuntimeConfig()
  const release = await latestRelease()
  return {
    version,
    latest: release && { version: release.version, url: release.url },
    available: !!release && isNewer(release.version, version),
    update
  }
}

export async function startUpdate() {
  const release = await latestRelease()
  if (!release || !isNewer(release.version, useRuntimeConfig().version)) {
    throw createError({ statusCode: 409, message: 'There is no newer version to update to.' })
  }
  const deployment = await kubeFetch<Deployment>(deploymentPath).catch((error) => {
    if (error instanceof KubeError && error.statusCode === 404) {
      throw createError({ statusCode: 409, message: 'Harblet doesn\'t run inside the cluster here, so it can\'t update itself.' })
    }
    throw error
  })
  if (update && !update.error) {
    throw createError({ statusCode: 409, message: 'An update is already running.' })
  }
  const current = deployment.spec.template.spec.containers.find(container => container.name === 'harblet')!.image
  const { version } = release
  update = { version }
  runUpdate(`${current.replace(/[:@][^/]*$/, '')}:${version}`, version)
}

async function runUpdate(image: string, version: string) {
  try {
    await pullImage(image, version)
    await kubeFetch(deploymentPath, {
      method: 'PATCH',
      contentType: 'application/strategic-merge-patch+json',
      body: { spec: { template: { spec: { containers: [{ name: 'harblet', image }] } } } }
    })
  } catch (error) {
    logger.error(error)
    update = { version, error: (error as Error).message }
  }
}

async function pullImage(image: string, version: string) {
  const name = `update-${version.replaceAll('.', '-')}`
  const path = `/apis/batch/v1/namespaces/${systemNamespace}/jobs/${name}`
  await kubeApply({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: systemNamespace, labels: { 'app.kubernetes.io/managed-by': 'harblet' } },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: pullTimeoutMinutes * 60,
      ttlSecondsAfterFinished: pullTimeoutMinutes * 60,
      template: {
        spec: {
          restartPolicy: 'Never',
          nodeSelector: { 'node-role.kubernetes.io/control-plane': 'true' },
          automountServiceAccountToken: false,
          enableServiceLinks: false,
          containers: [{ name: 'pull', image, command: ['node', '--version'] }]
        }
      }
    }
  })
  try {
    while (true) {
      const job = await kubeFetch<Job>(path)
      const conditions = job.status?.conditions?.filter(condition => condition.status === 'True') ?? []
      if (conditions.some(condition => condition.type === 'Complete')) {
        return
      }
      const failed = conditions.find(condition => condition.type === 'Failed')
      if (failed) {
        throw new Error(failed.reason === 'DeadlineExceeded'
          ? `Downloading version ${version} took longer than ${pullTimeoutMinutes} minutes.`
          : `Version ${version} doesn't start on this server.`)
      }
      const query = new URLSearchParams({ labelSelector: `job-name=${name}` })
      const pods = await kubeFetch<PodList>(`/api/v1/namespaces/${systemNamespace}/pods?${query}`)
      const waiting = pods.items
        .flatMap(pod => pod.status.containerStatuses ?? [])
        .map(status => status.state.waiting)
        .find(waiting => waiting && failureReasons.includes(waiting.reason))
      if (waiting) {
        throw new Error(waiting.message ?? waiting.reason)
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } finally {
    await kubeDelete(`${path}?propagationPolicy=Background`).catch(error => logger.error(error))
  }
}
