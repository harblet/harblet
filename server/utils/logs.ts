import type { EventStream } from 'h3'
import type { LogInstance } from '#shared/types/logs'

interface PodList {
  items: {
    metadata: { name: string, creationTimestamp: string }
    spec: { nodeName?: string }
    status: {
      containerStatuses?: {
        containerID?: string
        restartCount: number
        state: { running?: object, waiting?: { reason?: string }, terminated?: { reason?: string } }
        lastState: { terminated?: { containerID?: string } }
      }[]
    }
  }[]
}

async function listInstances(namespace: string, name: string, signal: AbortSignal): Promise<LogInstance[]> {
  const query = new URLSearchParams({ labelSelector: `app.kubernetes.io/name=${name}` })
  const pods = await kubeFetch<PodList>(`/api/v1/namespaces/${namespace}/pods?${query}`, { signal })
  return pods.items
    .sort((a, b) => b.metadata.creationTimestamp.localeCompare(a.metadata.creationTimestamp))
    .map((pod) => {
      const container = pod.status.containerStatuses?.[0]
      const follow = !!(container?.state.running || container?.state.terminated)
      const previous = follow ? undefined : container?.lastState.terminated
      return {
        id: (follow ? container?.containerID : previous?.containerID) ?? pod.metadata.name,
        pod: pod.metadata.name,
        server: pod.spec.nodeName,
        state: container?.state.running ? 'running' : container?.state.terminated ? 'terminated' : 'waiting',
        reason: container?.state.waiting?.reason ?? container?.state.terminated?.reason,
        restarts: container?.restartCount ?? 0,
        previous: !!previous
      }
    })
}

function pushLines(stream: EventStream, instanceId: string, lines: string[], since?: string) {
  return stream.push(lines.flatMap((line) => {
    const timestamp = line.slice(0, line.indexOf(' '))
    return since && timestamp <= since ? [] : [{ id: `${instanceId} ${timestamp}`, data: JSON.stringify(line) }]
  }))
}

export async function streamLogs(stream: EventStream, namespace: string, name: string, requested: string | undefined, lastEventId: string | undefined, signal: AbortSignal) {
  const instances = await listInstances(namespace, name, signal)
  const instance = instances.find(instance => instance.pod === requested) ?? instances[0] ?? null
  const chosen = instance?.pod === requested
  let listed = JSON.stringify(instances)
  await stream.push([
    { event: 'instances', data: listed },
    { event: 'instance', data: JSON.stringify(instance), retry: 3000 }
  ])

  const follow = instance?.state !== 'waiting'
  if (!instance || (!follow && !instance.previous)) {
    return
  }

  const [resumeId, resumeTime] = lastEventId?.split(' ') ?? []
  const since = resumeId === instance.id && resumeTime && !Number.isNaN(Date.parse(resumeTime)) ? resumeTime : undefined

  const replaced = new AbortController()
  const timer = setInterval(async () => {
    const current = await listInstances(namespace, name, signal).catch(() => undefined)
    if (!current) {
      return
    }
    if (chosen ? !current.some(({ pod }) => pod === instance.pod) : current[0] && current[0].pod !== instance.pod) {
      replaced.abort()
    } else if (JSON.stringify(current) !== listed) {
      listed = JSON.stringify(current)
      await stream.push({ event: 'instances', data: listed }).catch(() => {})
    }
  }, 5000)

  try {
    const query = new URLSearchParams({ timestamps: 'true', tailLines: since ? '5000' : '500', [follow ? 'follow' : 'previous']: 'true' })
    if (since) {
      query.set('sinceTime', since)
    }
    const response = await kubeRequest(`/api/v1/namespaces/${namespace}/pods/${instance.pod}/log?${query}`, {
      signal: AbortSignal.any([signal, replaced.signal])
    })
    const decoder = new TextDecoder()
    let rest = ''
    for await (const chunk of response.body!) {
      const lines = (rest + decoder.decode(chunk, { stream: true })).split('\n')
      rest = lines.pop()!
      await pushLines(stream, instance.id, lines, since)
    }
    if (rest) {
      await pushLines(stream, instance.id, [rest], since)
    }
  } catch (error) {
    if (!replaced.signal.aborted) {
      throw error
    }
  } finally {
    clearInterval(timer)
  }
}
