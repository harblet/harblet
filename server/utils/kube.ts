import { readFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'
import { Agent, fetch } from 'undici'
import WebSocket from 'ws'

export interface KubeObject {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace?: string
    labels?: Record<string, string>
    generation?: number
  }
}

export class KubeError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

const plurals: Record<string, string> = {
  Namespace: 'namespaces',
  NetworkPolicy: 'networkpolicies',
  Deployment: 'deployments',
  StatefulSet: 'statefulsets',
  Service: 'services',
  Secret: 'secrets',
  Ingress: 'ingresses',
  PersistentVolumeClaim: 'persistentvolumeclaims',
  Job: 'jobs',
  ServiceAccount: 'serviceaccounts',
  ClusterRoleBinding: 'clusterrolebindings',
  Plan: 'plans'
}

let dispatcher: Agent | undefined

type KubeRequestOptions = { method?: string, body?: unknown, contentType?: string, signal?: AbortSignal }

export async function kubeRequest(path: string, options: KubeRequestOptions = {}) {
  const { kubernetes } = useRuntimeConfig()
  const url = kubernetes.url || `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`
  dispatcher ??= new Agent({ bodyTimeout: 0, connect: { ca: await readFile(`${kubernetes.serviceAccountDir}/ca.crt`, 'utf8') } })
  const token = (await readFile(`${kubernetes.serviceAccountDir}/token`, 'utf8')).trim()

  const response = await fetch(url + path, {
    method: options.method,
    headers: {
      'accept': 'application/json',
      'authorization': `Bearer ${token}`,
      'content-type': options.contentType ?? 'application/json'
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    dispatcher
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string }
    throw new KubeError(response.status, data.message ?? response.statusText)
  }
  return response
}

export async function kubeFetch<T>(path: string, options: KubeRequestOptions = {}) {
  const response = await kubeRequest(path, options)
  return response.json() as Promise<T>
}

export async function kubeDelete(path: string) {
  await kubeFetch(path, { method: 'DELETE' }).catch((error) => {
    if (!(error instanceof KubeError && error.statusCode === 404)) {
      throw error
    }
  })
}

export function kubeApply<T extends KubeObject>(object: T) {
  const { apiVersion, kind, metadata } = object
  const group = apiVersion.includes('/') ? `/apis/${apiVersion}` : `/api/${apiVersion}`
  const namespace = metadata.namespace ? `/namespaces/${metadata.namespace}` : ''
  return kubeFetch<T>(`${group}${namespace}/${plurals[kind]}/${metadata.name}?fieldManager=harblet&force=true`, {
    method: 'PATCH',
    body: object,
    contentType: 'application/apply-patch+yaml'
  })
}

export async function kubeExec(namespace: string, pod: string, container: string, command: string[], stdin?: Readable) {
  const { kubernetes } = useRuntimeConfig()
  const url = kubernetes.url || `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`
  const ca = await readFile(`${kubernetes.serviceAccountDir}/ca.crt`, 'utf8')
  const token = (await readFile(`${kubernetes.serviceAccountDir}/token`, 'utf8')).trim()
  const query = new URLSearchParams([['container', container], ['stdin', String(!!stdin)], ['stdout', 'true'], ['stderr', 'true'], ...command.map(part => ['command', part])])

  const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/api/v1/namespaces/${namespace}/pods/${pod}/exec?${query}`, 'v5.channel.k8s.io', {
    ca,
    headers: { authorization: `Bearer ${token}` }
  })
  const stdout = new PassThrough()
  let stderr = ''
  let status: { status?: string, message?: string } | undefined
  let idle: NodeJS.Timeout | undefined
  // Kubernetes never reports the exit of a command that leaves stdin unread, so a command given stdin has to write output at least every 30 seconds.
  const watch = () => {
    clearTimeout(idle)
    if (stdin) {
      idle = setTimeout(() => stdout.destroy(new Error(stderr.trim() || 'The command stopped responding.')), 30_000)
    }
  }

  socket.on('message', (data: Buffer) => {
    watch()
    const payload = data.subarray(1)
    if (data[0] === 1 && !stdout.destroyed) {
      if (!stdout.write(payload)) {
        socket.pause()
        stdout.once('drain', () => socket.resume())
      }
    } else if (data[0] === 2) {
      stderr = (stderr + payload.toString()).slice(-4096)
    } else if (data[0] === 3) {
      status = JSON.parse(payload.toString())
    }
  })
  socket.on('open', async () => {
    if (!stdin) {
      return
    }
    watch()
    try {
      for await (const chunk of stdin) {
        await new Promise<void>((resolve, reject) => socket.send(Buffer.concat([Buffer.from([0]), chunk]), error => error ? reject(error) : resolve()))
      }
      socket.send(Buffer.from([255, 0]))
    } catch (error) {
      stdout.destroy(error as Error)
    }
  })
  socket.on('unexpected-response', (_, response) => {
    let body = ''
    response.on('data', chunk => body += chunk)
    response.on('end', () => {
      let message = response.statusMessage ?? 'Request failed'
      try {
        message = JSON.parse(body).message ?? message
      } catch {}
      stdout.destroy(new KubeError(response.statusCode ?? 500, message))
    })
  })
  socket.on('error', error => stdout.destroy(error))
  socket.on('close', () => {
    if (status?.status === 'Success') {
      stdout.end()
    } else {
      stdout.destroy(new Error(stderr.trim() || status?.message || 'The connection closed before the command finished.'))
    }
  })
  stdout.on('close', () => {
    clearTimeout(idle)
    socket.terminate()
  })

  return stdout
}

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function kubeName(name: string, fallback: string) {
  const prefix = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 47)
    .replace(/-+$/, '')
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), byte => alphabet[byte % alphabet.length]).join('')
  return `${prefix || fallback}-${suffix}`
}
