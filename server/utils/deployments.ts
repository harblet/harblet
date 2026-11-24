import { and, eq, inArray, sql } from 'drizzle-orm'
import { isDatabase, splitCommand } from '#shared/schemas/service'
import { deploymentVariables, deployments, services } from '../database/schema'

const logger = useLogger('utils:deployments')

interface Workload extends KubeObject {
  spec: {
    replicas: number
    template: { metadata: { labels: Record<string, string> } }
  }
  status?: {
    observedGeneration?: number
    replicas?: number
    updatedReplicas?: number
    availableReplicas?: number
    currentRevision?: string
    updateRevision?: string
  }
}

type WorkloadKind = 'deployments' | 'statefulsets'

type Service = typeof services.$inferSelect & { volumes: { id: string, mountPath: string }[] }

type Source = {
  image: string | null
  imageDigest: string | null
  commitSha: string | null
  commitMessage: string | null
  port: number | null
  healthCheckPath: string | null
  command: string | null
  environmentVariables: { key: string, value: string }[]
}

interface PodList {
  items: {
    metadata: { uid: string }
    status: { containerStatuses?: { imageID?: string, state: { waiting?: { reason: string, message?: string } } }[] }
  }[]
}

interface EventList {
  items: {
    reason?: string
    message?: string
    count?: number
    series?: { count?: number }
    firstTimestamp?: string
    eventTime?: string
  }[]
}

type Result = { status: 'succeeded' | 'failed' | 'cancelled', error?: string, imageDigest?: string }

const failureReasons = ['ImagePullBackOff', 'InvalidImageName', 'CrashLoopBackOff', 'CreateContainerConfigError']
const maxFailureDuration = 5 * 60 * 1000
const defaultPort = 8080

export async function queueDeployment(tx: Transaction, serviceId: string, userId: string | null, source?: Source, afterDeploymentId?: string, trigger: 'user' | 'hook' | 'push' = userId ? 'user' : 'hook') {
  const [service] = await tx.select({ image: services.image, port: services.port, healthCheckPath: services.healthCheckPath, command: services.command })
    .from(services)
    .where(eq(services.id, serviceId))
    .for('update')
  await tx.update(deployments)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(and(eq(deployments.serviceId, serviceId), eq(deployments.status, 'queued')))
  const { image, imageDigest, commitSha, commitMessage, port, healthCheckPath, command, environmentVariables } = source ?? {
    ...service!,
    imageDigest: null,
    commitSha: null,
    commitMessage: null,
    environmentVariables: await tx.query.environmentVariables.findMany({
      where: { serviceId },
      columns: { key: true, value: true }
    })
  }
  const [deployment] = await tx.insert(deployments)
    .values({ serviceId, userId, afterDeploymentId, trigger, status: 'queued', image, imageDigest, commitSha, commitMessage, port, healthCheckPath, command })
    .returning({ id: deployments.id })
  if (environmentVariables.length) {
    await tx.insert(deploymentVariables).values(environmentVariables.map(({ key, value }) => ({ deploymentId: deployment!.id, key, value })))
  }
  return deployment!.id
}

export async function deployService(serviceId: string, userId: string | null, source?: Source, trigger?: 'hook' | 'push') {
  const id = await db.transaction(tx => queueDeployment(tx, serviceId, userId, source, undefined, trigger))
  await startQueuedDeployments()
  return db.query.deployments.findFirst({ where: { id } })
}

export async function startQueuedDeployments() {
  const queued = await db.selectDistinct({ serviceId: deployments.serviceId }).from(deployments).where(eq(deployments.status, 'queued'))
  for (const { serviceId } of queued) {
    await startNextDeployment(serviceId).catch(error => logger.error(error))
  }
}

export async function cancelDeployment(id: string) {
  const deployment = await db.transaction(async (tx) => {
    const deployment = await tx.query.deployments.findFirst({ where: { id }, columns: { serviceId: true, status: true } })
    if (!deployment) {
      throw createError({ statusCode: 404, message: 'Deployment not found.' })
    }
    await tx.select({ id: services.id }).from(services).where(eq(services.id, deployment.serviceId)).for('update')
    const [cancelled] = await tx.update(deployments)
      .set({ status: 'cancelled', finishedAt: new Date() })
      .where(and(eq(deployments.id, id), inArray(deployments.status, ['queued', 'building'])))
      .returning({ id: deployments.id })
    if (!cancelled) {
      throw createError({ statusCode: 409, message: 'Only queued deployments and running builds can be cancelled.' })
    }
    return deployment
  })
  if (deployment.status === 'building') {
    await deleteBuild(id).catch(error => logger.error(error))
  }
  await startQueuedDeployments()
}

async function startNextDeployment(serviceId: string) {
  const next = await db.transaction(async (tx) => {
    await tx.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).for('update')
    const service = await tx.query.services.findFirst({
      where: { id: serviceId },
      with: {
        project: { columns: { namespace: true } },
        volumes: { columns: { id: true, mountPath: true } },
        deployments: {
          columns: { id: true, afterDeploymentId: true, status: true, image: true, imageDigest: true, port: true, healthCheckPath: true, command: true },
          where: { status: { in: ['queued', 'building', 'deploying'] } },
          orderBy: { id: 'desc' },
          with: { environmentVariables: { columns: { key: true, value: true } } }
        }
      }
    })
    const [newest] = service?.deployments ?? []
    if (!service || !newest || service.deployments.some(deployment => deployment.status !== 'queued')) {
      return
    }
    if (newest.afterDeploymentId && await tx.query.deployments.findFirst({
      where: { id: newest.afterDeploymentId, status: { in: ['queued', 'building', 'deploying'] } },
      columns: { id: true }
    })) {
      return
    }
    const build = service.type === 'git' && !newest.imageDigest
    await tx.update(deployments).set({ status: build ? 'building' : 'deploying', startedAt: new Date() }).where(eq(deployments.id, newest.id))
    return { deployment: newest, service, build }
  })
  if (next?.build) {
    await startBuild(next.deployment, next.service, next.service.project.namespace)
  } else if (next) {
    await rollOut(next.deployment, next.service, next.service.project.namespace)
  }
}

async function startBuild(
  { id, environmentVariables }: { id: string, environmentVariables: { key: string, value: string }[] },
  service: typeof services.$inferSelect,
  namespace: string
) {
  try {
    await applySystemComponents()
    await createBuild(id, service, namespace, environmentVariables)
  } catch (error) {
    await deleteBuild(id).catch(error => logger.error(error))
    return finishDeployment(id, { status: 'failed', error: (error as Error).message })
  }
  trackBuild(id)
}

async function trackBuild(id: string) {
  let failingSince: number | undefined
  while (true) {
    try {
      if (await advanceBuild(id)) {
        return
      }
      failingSince = undefined
    } catch (error) {
      failingSince ??= Date.now()
      if (Date.now() - failingSince >= maxFailureDuration) {
        await deleteBuild(id).catch(error => logger.error(error))
        await finishDeployment(id, { status: 'failed', error: (error as Error).message }).catch(error => logger.error(error))
        return
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

async function advanceBuild(id: string) {
  const deployment = await db.query.deployments.findFirst({ where: { id }, columns: { status: true } })
  if (deployment?.status !== 'building') {
    await deleteBuild(id)
    return true
  }

  const { logs, commit, result } = await inspectBuild(id)
  if (logs) {
    await db.update(deployments)
      .set({ buildLogs: logs, ...commit })
      .where(and(eq(deployments.id, id), eq(deployments.status, 'building'), sql`${deployments.buildLogs} is distinct from ${logs}`))
  }
  if (!result) {
    return false
  }

  if (result.status === 'failed') {
    await finishDeployment(id, result)
    await deleteBuild(id)
    return true
  }

  const built = await db.query.deployments.findFirst({
    where: { id },
    columns: { id: true, port: true, healthCheckPath: true, command: true },
    with: {
      environmentVariables: { columns: { key: true, value: true } },
      service: { with: { project: { columns: { namespace: true } }, volumes: { columns: { id: true, mountPath: true } } } }
    }
  })
  const { service } = built!
  const image = builtImage(service.project.namespace, service.hostname)
  const { imageDigest } = result
  const ports = webPorts(result.ports)
  const port = service.worker ? null : built!.port ?? variablePort(built!.environmentVariables) ?? (ports.length > 1 ? undefined : ports[0] ?? defaultPort)
  if (port === undefined) {
    await finishDeployment(id, { status: 'failed', error: `The image exposes ports ${formatPorts(ports)}. Set the port in the service's settings.` })
    await deleteBuild(id)
    return true
  }
  const [started] = await db.update(deployments)
    .set({ status: 'deploying', image, imageDigest, port, ...commit })
    .where(and(eq(deployments.id, id), eq(deployments.status, 'building')))
    .returning({ id: deployments.id })
  if (started) {
    await rollOut({ ...built!, image, imageDigest, port }, service, service.project.namespace)
  }
  await deleteBuild(id)
  return true
}

function variablePort(variables: { key: string, value: string }[]) {
  const port = Number(variables.find(({ key }) => key === 'PORT')?.value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined
}

async function resolvePort(
  { id, port, environmentVariables }: { id: string, port: number | null, environmentVariables: { key: string, value: string }[] },
  service: Service
) {
  if (isDatabase(service.type) || service.worker) {
    return null
  }
  if (port) {
    return port
  }
  if (service.type !== 'git') {
    throw new Error('This deployment has no port. Set the port in the service\'s settings and deploy again.')
  }
  const resolved = variablePort(environmentVariables) ?? defaultPort
  await db.update(deployments).set({ port: resolved }).where(eq(deployments.id, id))
  return resolved
}

async function rollOut(
  { id, image, imageDigest, port, healthCheckPath, command, environmentVariables }: {
    id: string
    image: string | null
    imageDigest: string | null
    port: number | null
    healthCheckPath: string | null
    command: string | null
    environmentVariables: { key: string, value: string }[]
  },
  service: Service,
  namespace: string
) {
  try {
    port = await resolvePort({ id, port, environmentVariables }, service)
  } catch (error) {
    return finishDeployment(id, { status: 'failed', error: (error as Error).message })
  }
  const selector = { 'app.kubernetes.io/name': service.hostname }
  const labels = { ...selector, 'app.kubernetes.io/managed-by': 'harblet' }
  const secret = `${service.hostname}-${id}`
  const probe = healthCheckPath
    ? { httpGet: { path: healthCheckPath, port } }
    : { tcpSocket: { port } }
  const reference = imageDigest ? `${image?.split('@')[0]}@${imageDigest}` : image
  const imagePullPolicy = imageDigest ? 'IfNotPresent' : 'Always'
  const database = databaseContainer(service)
  const variables = database
    ? Object.entries(database.env).map(([key, value]) => ({ key, value }))
    : service.type === 'git' && port && !environmentVariables.some(({ key }) => key === 'PORT')
      ? [...environmentVariables, { key: 'PORT', value: String(port) }]
      : environmentVariables

  try {
    await kubeApply({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: secret, namespace, labels: { ...labels, 'harblet.com/deployment': id } },
      type: 'Opaque',
      data: Object.fromEntries(variables.map(({ key, value }) => [key, Buffer.from(value).toString('base64')]))
    })

    if (database) {
      await kubeApply({
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        metadata: { name: service.hostname, namespace, labels },
        spec: {
          replicas: 1,
          serviceName: service.hostname,
          podManagementPolicy: 'Parallel',
          minReadySeconds: 10,
          persistentVolumeClaimRetentionPolicy: { whenDeleted: 'Retain', whenScaled: 'Retain' },
          selector: { matchLabels: selector },
          template: {
            metadata: { labels: { ...labels, 'harblet.com/deployment': id } },
            spec: {
              securityContext: { runAsUser: 999, runAsGroup: 999 },
              containers: [{
                name: service.hostname,
                image: reference,
                imagePullPolicy,
                envFrom: [{ secretRef: { name: secret } }],
                ports: [{ name: service.type, containerPort: database.port }],
                readinessProbe: { exec: { command: database.probe } },
                volumeMounts: [{ name: 'data', mountPath: database.mountPath }]
              }]
            }
          },
          volumeClaimTemplates: [{
            metadata: { name: 'data' },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'local-path',
              resources: { requests: { storage: '1Gi' } }
            }
          }]
        }
      })

      await kubeApply({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: service.hostname, namespace, labels },
        spec: { selector, ports: [{ name: service.type, port: database.port, targetPort: service.type }] }
      })
    } else {
      const volumes = service.volumes.map(volume => ({ ...volume, name: `volume-${volume.id}`, claimName: `volume-${service.hostname}-${volume.id}` }))
      for (const volume of volumes) {
        await kubeApply({
          apiVersion: 'v1',
          kind: 'PersistentVolumeClaim',
          metadata: { name: volume.claimName, namespace, labels: { ...labels, 'harblet.com/volume': volume.id, 'harblet.com/deployment': id } },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: 'local-path',
            resources: { requests: { storage: '1Gi' } }
          }
        })
      }

      await kubeApply({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: service.hostname, namespace, labels },
        spec: {
          replicas: service.instances,
          minReadySeconds: 10,
          strategy: volumes.length
            ? { type: 'Recreate' }
            : { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } },
          selector: { matchLabels: selector },
          template: {
            metadata: { labels: { ...labels, 'harblet.com/deployment': id } },
            spec: {
              containers: [{
                name: service.hostname,
                image: reference,
                imagePullPolicy,
                args: command ? splitCommand(command) : undefined,
                envFrom: [{ secretRef: { name: secret } }],
                ports: port ? [{ name: 'http', containerPort: port }] : [],
                readinessProbe: port ? probe : undefined,
                volumeMounts: volumes.map(({ name, mountPath }) => ({ name, mountPath }))
              }],
              volumes: volumes.map(({ name, claimName }) => ({ name, persistentVolumeClaim: { claimName } })),
              topologySpreadConstraints: [{
                maxSkew: 1,
                topologyKey: 'kubernetes.io/hostname',
                whenUnsatisfiable: 'ScheduleAnyway',
                labelSelector: { matchLabels: selector },
                matchLabelKeys: ['pod-template-hash']
              }],
              tolerations: volumes.length
                ? []
                : ['not-ready', 'unreachable'].map(taint => ({
                    key: `node.kubernetes.io/${taint}`,
                    operator: 'Exists',
                    effect: 'NoExecute',
                    tolerationSeconds: 30
                  }))
            }
          }
        }
      })

      if (port) {
        await kubeApply({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: service.hostname, namespace, labels },
          spec: { selector, ports: [{ name: 'http', port, targetPort: 'http' }] }
        })
      } else {
        await kubeDelete(`/api/v1/namespaces/${namespace}/services/${service.hostname}`)
      }
    }
  } catch (error) {
    return finishDeployment(id, { status: 'failed', error: (error as Error).message })
  }

  trackDeployment(id, namespace, service.hostname, database ? 'statefulsets' : 'deployments', service.startTimeout)
}

export async function resumeDeployments() {
  const pending = await db.query.deployments.findMany({
    where: { status: { in: ['building', 'deploying'] } },
    columns: { id: true, status: true },
    with: { service: { columns: { hostname: true, type: true, startTimeout: true }, with: { project: { columns: { namespace: true } } } } }
  })
  for (const deployment of pending) {
    if (deployment.status === 'building') {
      trackBuild(deployment.id)
    } else {
      const { hostname, type, startTimeout, project } = deployment.service
      trackDeployment(deployment.id, project.namespace, hostname, isDatabase(type) ? 'statefulsets' : 'deployments', startTimeout)
    }
  }
  startQueuedDeployments().catch(error => logger.error(error))
}

async function trackDeployment(id: string, namespace: string, name: string, kind: WorkloadKind, startTimeout: number) {
  const startedAt = Date.now()
  let failingSince: number | undefined
  while (true) {
    try {
      const result = await checkRollout(id, namespace, name, kind, startedAt, startTimeout)
      if (result) {
        if (result.status === 'succeeded') {
          const stale = `app.kubernetes.io/name=${name},harblet.com/deployment!=${id}`
          await kubeFetch(`/api/v1/namespaces/${namespace}/secrets?${new URLSearchParams({ labelSelector: stale })}`, { method: 'DELETE' }).catch(error => logger.error(error))
          await kubeFetch(`/api/v1/namespaces/${namespace}/persistentvolumeclaims?${new URLSearchParams({ labelSelector: `${stale},harblet.com/volume` })}`, { method: 'DELETE' }).catch(error => logger.error(error))
        }
        await finishDeployment(id, result)
        return
      }
      failingSince = undefined
    } catch (error) {
      failingSince ??= Date.now()
      if (Date.now() - failingSince >= maxFailureDuration) {
        await finishDeployment(id, { status: 'failed', error: (error as Error).message }).catch(error => logger.error(error))
        return
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

async function checkRollout(id: string, namespace: string, name: string, kind: WorkloadKind, startedAt: number, startTimeout: number): Promise<Result | undefined> {
  const workload = await kubeFetch<Workload>(`/apis/apps/v1/namespaces/${namespace}/${kind}/${name}`)
  if (workload.spec.template.metadata.labels['harblet.com/deployment'] !== id) {
    return { status: 'cancelled' }
  }

  const { status } = workload
  if ((status?.observedGeneration ?? 0) < (workload.metadata.generation ?? 0)) {
    return
  }

  if (kind === 'statefulsets') {
    const stale = new URLSearchParams({ labelSelector: `app.kubernetes.io/name=${name},harblet.com/deployment!=${id}` })
    await kubeFetch(`/api/v1/namespaces/${namespace}/pods?${stale}`, { method: 'DELETE' })
  }

  const query = new URLSearchParams({ labelSelector: `harblet.com/deployment=${id}` })
  const pods = await kubeFetch<PodList>(`/api/v1/namespaces/${namespace}/pods?${query}`)
  const events = await listEvents(namespace, pods).catch((error) => {
    logger.error(error)
    return []
  })
  await recordEvents(id, events).catch(error => logger.error(error))
  const failedPulls = events
    .filter(event => event.reason === 'Failed' && event.message?.startsWith('Failed to pull image'))
    .reduce((total, event) => total + eventCount(event), 0)

  const containers = pods.items.flatMap(pod => pod.status.containerStatuses ?? [])
  const waiting = containers
    .map(container => container.state.waiting)
    .find(waiting => waiting && failureReasons.includes(waiting.reason) && (waiting.reason !== 'ImagePullBackOff' || failedPulls > 1))
  if (waiting) {
    return { status: 'failed', error: waiting.message ?? waiting.reason }
  }

  const { replicas } = workload.spec
  if (status?.updatedReplicas === replicas
    && status.replicas === replicas
    && status.availableReplicas === replicas
    && status.currentRevision === status.updateRevision) {
    const imageID = containers.find(container => container.imageID)?.imageID
    return { status: 'succeeded', imageDigest: imageID?.split('@')[1] }
  }

  if (Date.now() - startedAt >= startTimeout * 60 * 1000) {
    return { status: 'failed', error: `The service did not become ready within ${startTimeout} ${startTimeout === 1 ? 'minute' : 'minutes'}.` }
  }
}

async function listEvents(namespace: string, pods: PodList) {
  const lists = await Promise.all(pods.items.map((pod) => {
    const query = new URLSearchParams({ fieldSelector: `involvedObject.uid=${pod.metadata.uid}` })
    return kubeFetch<EventList>(`/api/v1/namespaces/${namespace}/events?${query}`)
  }))
  return lists.flatMap(list => list.items)
}

function eventCount(event: EventList['items'][number]) {
  return event.count ?? event.series?.count ?? 1
}

async function recordEvents(id: string, events: EventList['items']) {
  const logs = events
    .map((event) => {
      const count = eventCount(event)
      const time = event.firstTimestamp ?? event.eventTime
      const message = event.message?.trim() ?? ''
      return {
        time: time ? logTime(time) : '',
        line: `${event.reason}: ${message}${count > 1 ? ` (x${count})` : ''}`
      }
    })
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(event => `${event.time} ${event.line}`)
    .join('\n')
  if (!logs) {
    return
  }
  await db.update(deployments)
    .set({ logs })
    .where(and(eq(deployments.id, id), eq(deployments.status, 'deploying'), sql`${deployments.logs} is distinct from ${logs}`))
}

function logTime(time: string | Date) {
  return `${new Date(time).toISOString().slice(0, 19)}Z`
}

async function finishDeployment(id: string, result: Result) {
  const ready = `${logTime(new Date())} Ready: The new version is running.`
  const [deployment] = await db.update(deployments)
    .set({
      status: result.status,
      error: result.error,
      imageDigest: result.imageDigest,
      finishedAt: new Date(),
      logs: result.status === 'succeeded' ? sql`concat_ws(chr(10), ${deployments.logs}, ${ready}::text)` : undefined
    })
    .where(and(eq(deployments.id, id), inArray(deployments.status, ['building', 'deploying'])))
    .returning({ serviceId: deployments.serviceId, imageDigest: deployments.imageDigest })
  if (deployment) {
    if (result.status === 'failed') {
      await queueRollback(deployment.serviceId, deployment.imageDigest)
    }
    await startQueuedDeployments()
  }
}

async function queueRollback(serviceId: string, failedDigest: string | null) {
  await db.transaction(async (tx) => {
    const [service] = await tx.select({ type: services.type }).from(services).where(eq(services.id, serviceId)).for('update')
    if (!service || !isDatabase(service.type)) {
      return
    }
    const queued = await tx.query.deployments.findFirst({ where: { serviceId, status: 'queued' }, columns: { id: true } })
    const previous = await tx.query.deployments.findFirst({
      where: { serviceId, status: 'succeeded' },
      orderBy: { id: 'desc' },
      columns: { image: true, imageDigest: true, port: true, healthCheckPath: true }
    })
    if (queued || !previous?.imageDigest || previous.imageDigest === failedDigest) {
      return
    }
    await tx.insert(deployments).values({ ...previous, serviceId, trigger: 'rollback' })
  })
}
