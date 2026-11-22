import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { metricRanges } from '#shared/schemas/metric'
import type { MetricRange } from '#shared/schemas/metric'
import { serverMetrics, serviceMetrics } from '../database/schema'

interface Network {
  time: string
  interfaces?: { name: string, rxBytes?: number, txBytes?: number }[]
}

interface Usage {
  cpu?: { usageNanoCores?: number }
  memory?: { workingSetBytes?: number }
  network?: Network
}

interface Summary {
  node: Usage & { fs?: { usedBytes?: number, capacityBytes?: number } }
  pods: (Usage & { podRef: { uid: string } })[] | null
}

interface NodeList {
  items: { metadata: { name: string }, status: { capacity: { cpu: string } } }[]
}

interface PodList {
  items: {
    metadata: { uid: string, namespace: string, labels: Record<string, string>, deletionTimestamp?: string }
    status: { phase: string }
  }[]
}

type Buckets = ReturnType<typeof buckets>

const logger = useLogger('utils:metrics')

const interval = 60_000
const retention = 30 * 24 * 60 * interval
const virtualInterfaces = /^(cni|flannel)/
const counters = new Map<string, { time: number, rx: number, tx: number }>()
let sampling: Promise<unknown> = Promise.resolve()

function networkRate(key: string, network?: Network) {
  const interfaces = network?.interfaces?.filter(({ name }) => !virtualInterfaces.test(name)) ?? []
  if (!network || !interfaces.length) {
    return
  }
  const current = {
    time: Date.parse(network.time),
    rx: interfaces.reduce((total, { rxBytes = 0 }) => total + rxBytes, 0),
    tx: interfaces.reduce((total, { txBytes = 0 }) => total + txBytes, 0)
  }
  const previous = counters.get(key)
  counters.set(key, current)
  if (!previous || current.time <= previous.time || current.rx < previous.rx || current.tx < previous.tx) {
    return
  }
  const seconds = (current.time - previous.time) / 1000
  return { in: (current.rx - previous.rx) / seconds, out: (current.tx - previous.tx) / seconds }
}

async function sample() {
  const [nodes, pods, services] = await Promise.all([
    kubeFetch<NodeList>('/api/v1/nodes'),
    kubeFetch<PodList>(`/api/v1/pods?${new URLSearchParams({ labelSelector: 'app.kubernetes.io/managed-by=harblet,app.kubernetes.io/name' })}`),
    db.query.services.findMany({ columns: { id: true, hostname: true }, with: { project: { columns: { namespace: true } } } })
  ])
  const time = new Date()
  const cores = new Map(nodes.items.map(node => [node.metadata.name, parseQuantity(node.status.capacity.cpu)]))
  const summaries = new Map<string, Summary>()
  await Promise.all(nodes.items.map(async ({ metadata: { name } }) => {
    const summary = await kubeFetch<Summary>(`/api/v1/nodes/${name}/proxy/stats/summary`, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined)
    if (summary) {
      summaries.set(name, summary)
    }
  }))

  const serverRows = [...summaries].flatMap(([server, { node }]) => {
    const cpu = node.cpu?.usageNanoCores
    const memory = node.memory?.workingSetBytes
    const disk = node.fs?.usedBytes
    const diskTotal = node.fs?.capacityBytes
    if (cpu === undefined || memory === undefined || disk === undefined || diskTotal === undefined) {
      return []
    }
    const network = networkRate(`server/${server}`, node.network)
    return [{ server, time, cpu: cpu / 1e9, cores: cores.get(server)!, memory, disk, diskTotal, networkIn: network?.in ?? null, networkOut: network?.out ?? null }]
  })

  const stats = new Map([...summaries].flatMap(([server, summary]) => (summary.pods ?? []).map(pod => [pod.podRef.uid, { ...pod, server }] as const)))
  const serviceIds = new Map(services.map(service => [`${service.project.namespace}/${service.hostname}`, service.id]))
  const usage = new Map<string, { cpu: number, memory: number, networkIn: number | null, networkOut: number | null, servers: Set<string>, complete: boolean }>()
  for (const { metadata, status } of pods.items) {
    const serviceId = serviceIds.get(`${metadata.namespace}/${metadata.labels['app.kubernetes.io/name']}`)
    if (!serviceId || metadata.deletionTimestamp || status.phase !== 'Running') {
      continue
    }
    const total = usage.get(serviceId) ?? { cpu: 0, memory: 0, networkIn: null, networkOut: null, servers: new Set(), complete: true }
    usage.set(serviceId, total)
    const pod = stats.get(metadata.uid)
    const cpu = pod?.cpu?.usageNanoCores
    const memory = pod?.memory?.workingSetBytes
    if (!pod || cpu === undefined || memory === undefined) {
      total.complete = false
      continue
    }
    const network = networkRate(`pod/${metadata.uid}`, pod.network)
    total.servers.add(pod.server)
    total.cpu += cpu / 1e9
    total.memory += memory
    if (network) {
      total.networkIn = (total.networkIn ?? 0) + network.in
      total.networkOut = (total.networkOut ?? 0) + network.out
    }
  }
  const serviceRows = [...usage]
    .filter(([, total]) => total.complete)
    .map(([serviceId, { cpu, servers, memory, networkIn, networkOut }]) => ({
      serviceId,
      time,
      cpu,
      cores: [...servers].reduce((total, server) => total + cores.get(server)!, 0),
      memory,
      networkIn,
      networkOut
    }))

  if (serverRows.length) {
    await db.insert(serverMetrics).values(serverRows)
  }
  if (serviceRows.length) {
    await db.insert(serviceMetrics).values(serviceRows).catch(async (error) => {
      if ((error as { cause?: { code?: string } }).cause?.code !== '23503') {
        throw error
      }
      const existing = await db.query.services.findMany({ where: { id: { in: serviceRows.map(row => row.serviceId) } }, columns: { id: true } })
      const ids = new Set(existing.map(({ id }) => id))
      const rows = serviceRows.filter(row => ids.has(row.serviceId))
      if (rows.length) {
        await db.insert(serviceMetrics).values(rows)
      }
    })
  }
  for (const [key, counter] of counters) {
    if (counter.time < time.getTime() - 10 * interval) {
      counters.delete(key)
    }
  }
}

async function prune() {
  const before = new Date(Date.now() - retention)
  await db.delete(serverMetrics).where(lt(serverMetrics.time, before))
  await db.delete(serviceMetrics).where(lt(serviceMetrics.time, before))
}

export function scheduleMetrics() {
  const run = (task: () => Promise<void>) => task().catch(error => logger.error(error))
  const runSample = () => {
    sampling = sampling.then(() => run(sample))
  }
  run(prune)
  runSample()
  setInterval(runSample, interval)
  setInterval(() => run(prune), 60 * interval)
}

export async function deleteServerMetrics(server: string) {
  await sampling
  await db.delete(serverMetrics).where(eq(serverMetrics.server, server))
}

function buckets(range: MetricRange) {
  const { duration, bucket } = metricRanges[range]
  const count = duration / bucket
  const first = Math.floor(Date.now() / bucket) - count + 1
  return { bucket, count, first, since: new Date(first * bucket) }
}

function bucketIndex(column: AnyColumn, { bucket }: Buckets) {
  return sql<number>`floor(extract(epoch from ${column}) / ${sql.raw(String(bucket / 1000))})::int`
}

function average(column: AnyColumn) {
  return sql<number | null>`avg(${column})::float8`
}

function averagePercent(used: AnyColumn, total: AnyColumn) {
  return sql<number | null>`avg(${used} / ${total} * 100)::float8`
}

function recently() {
  return new Date(Date.now() - 3 * interval)
}

function fill<T>(points: Map<number, T> | undefined, { bucket, count, first }: Buckets) {
  return Array.from({ length: count }, (_, i) => ({ time: new Date((first + i) * bucket), ...points?.get(first + i) }) as { time: Date } & Partial<T>)
}

function withCpuPercent<T extends { cpu: number, cores: number }>(row: T) {
  return { ...row, cpu: row.cpu / row.cores * 100 }
}

export async function listServerMetrics(range: MetricRange) {
  const window = buckets(range)
  const index = bucketIndex(serverMetrics.time, window)
  const [servers, rows, recent] = await Promise.all([
    listServers(),
    db.select({
      server: serverMetrics.server,
      index,
      cpu: averagePercent(serverMetrics.cpu, serverMetrics.cores),
      memory: average(serverMetrics.memory),
      disk: average(serverMetrics.disk),
      networkIn: average(serverMetrics.networkIn),
      networkOut: average(serverMetrics.networkOut)
    }).from(serverMetrics).where(gte(serverMetrics.time, window.since)).groupBy(serverMetrics.server, index),
    db.select().from(serverMetrics).where(gte(serverMetrics.time, recently())).orderBy(serverMetrics.time)
  ])
  const points = new Map<string, Map<number, Omit<typeof rows[number], 'server' | 'index'>>>()
  for (const { server, index, ...values } of rows) {
    points.set(server, (points.get(server) ?? new Map()).set(index, values))
  }
  const current = new Map(recent.map(row => [row.server, row]))
  return servers.map(({ name, ready, cpu, memory }) => {
    const row = current.get(name)
    return {
      name,
      ready,
      cores: cpu.total,
      memory: memory.total,
      current: row ? withCpuPercent(row) : null,
      samples: fill(points.get(name), window)
    }
  })
}

export async function getServiceMetrics(serviceId: string, range: MetricRange) {
  const window = buckets(range)
  const index = bucketIndex(serviceMetrics.time, window)
  const [rows, [current]] = await Promise.all([
    db.select({
      index,
      cpu: averagePercent(serviceMetrics.cpu, serviceMetrics.cores),
      memory: average(serviceMetrics.memory),
      networkIn: average(serviceMetrics.networkIn),
      networkOut: average(serviceMetrics.networkOut)
    }).from(serviceMetrics).where(and(eq(serviceMetrics.serviceId, serviceId), gte(serviceMetrics.time, window.since))).groupBy(index),
    db.select().from(serviceMetrics)
      .where(and(eq(serviceMetrics.serviceId, serviceId), gte(serviceMetrics.time, recently())))
      .orderBy(desc(serviceMetrics.time))
      .limit(1)
  ])
  return {
    current: current ? withCpuPercent(current) : null,
    samples: fill(new Map(rows.map(({ index, ...values }) => [index, values])), window)
  }
}
