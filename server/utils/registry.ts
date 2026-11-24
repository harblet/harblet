const logger = useLogger('utils:registry')

const nonWebPorts = new Set([21, 22, 25, 53, 443, 465, 587, 993, 995])

const manifestTypes = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json'
].join(', ')

interface Manifest {
  manifests?: { digest: string, platform?: { os: string } }[]
  config?: { digest: string }
}

interface ImageConfig {
  config?: { ExposedPorts?: Record<string, unknown> }
}

function parseImage(image: string) {
  const [name = '', digest] = image.split('@')
  const slash = name.indexOf('/')
  const domain = name.slice(0, slash)
  const external = slash > -1 && (domain.includes('.') || domain.includes(':') || domain === 'localhost')
  const path = external ? name.slice(slash + 1) : name
  const colon = path.lastIndexOf(':')
  const repository = colon > -1 ? path.slice(0, colon) : path
  const hub = !external || domain === 'docker.io' || domain === 'index.docker.io'
  return {
    registry: hub ? 'registry-1.docker.io' : domain,
    repository: hub && !repository.includes('/') ? `library/${repository}` : repository,
    reference: digest ?? (colon > -1 ? path.slice(colon + 1) : 'latest')
  }
}

export function webPorts(ports: number[]) {
  return ports.filter(port => !nonWebPorts.has(port))
}

export function formatPorts(ports: number[]) {
  return new Intl.ListFormat('en').format(ports.map(String))
}

export async function imagePort(image: string) {
  const ports = await exposedPorts(image).catch((error) => {
    logger.warn(error)
    return undefined
  })
  const candidates = ports && webPorts(ports)
  if (candidates?.length === 1) {
    return candidates[0]!
  }
  const message = !candidates
    ? 'Harblet couldn\'t read the image\'s ports from its registry. Enter the port your app listens on.'
    : candidates.length
      ? `The image exposes ports ${formatPorts(candidates)}. Enter the one your app listens on.`
      : 'The image doesn\'t say which port it listens on. Enter the port, or make the service a worker if it doesn\'t take requests.'
  throw createError({ statusCode: 400, message, data: { errors: [{ name: 'port', message }] } })
}

async function exposedPorts(image: string) {
  const { registry, repository, reference } = parseImage(image)
  let authorization: string | undefined

  async function get<T>(path: string): Promise<T> {
    const url = `https://${registry}/v2/${repository}/${path}`
    const request = () => fetch(url, { headers: { accept: manifestTypes, ...(authorization && { authorization }) }, signal: AbortSignal.timeout(15_000) })
    let response = await request()
    const challenge = response.headers.get('www-authenticate') ?? ''
    if (response.status === 401 && !authorization && /^bearer /i.test(challenge)) {
      const { realm, ...params } = Object.fromEntries([...challenge.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key!, value!]))
      const token = await fetch(`${realm}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(15_000) })
      if (token.ok) {
        const body = await token.json() as { token?: string, access_token?: string }
        authorization = `Bearer ${body.token ?? body.access_token}`
        response = await request()
      }
    }
    if (!response.ok) {
      throw new Error(`Reading ${url} failed with status ${response.status}`)
    }
    return await response.json() as T
  }

  let manifest = await get<Manifest>(`manifests/${reference}`)
  const platform = manifest.manifests?.find(entry => entry.platform?.os !== 'unknown')
  if (platform) {
    manifest = await get<Manifest>(`manifests/${platform.digest}`)
  }
  const { config } = await get<ImageConfig>(`blobs/${manifest.config!.digest}`)
  return Object.keys(config?.ExposedPorts ?? {})
    .filter(port => !/\/(udp|sctp)$/.test(port))
    .map(port => Number.parseInt(port))
    .toSorted((a, b) => a - b)
}
