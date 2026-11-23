import { randomBytes } from 'node:crypto'
import { BlockList, isIPv4 } from 'node:net'
import { githubConnectionSchema } from '#shared/schemas/git-connection'

const privateAddresses = new BlockList()
privateAddresses.addSubnet('10.0.0.0', 8)
privateAddresses.addSubnet('100.64.0.0', 10)
privateAddresses.addSubnet('127.0.0.0', 8)
privateAddresses.addSubnet('169.254.0.0', 16)
privateAddresses.addSubnet('172.16.0.0', 12)
privateAddresses.addSubnet('192.168.0.0', 16)

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, githubConnectionSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const { siteUrl } = useRuntimeConfig().public
  const { hostname } = new URL(siteUrl)
  const reachable = hostname !== 'localhost' && !(isIPv4(hostname) && privateAddresses.check(hostname))
  const state = randomBytes(16).toString('base64url')
  setCookie(event, 'github-state', state, { httpOnly: true, sameSite: 'lax', secure: siteUrl.startsWith('https:'), path: '/api/github', maxAge: 60 * 60 })

  const { organization } = result.data
  return {
    url: `https://github.com/${organization ? `organizations/${organization}/` : ''}settings/apps/new?state=${state}`,
    manifest: JSON.stringify({
      name: `harblet-${randomBytes(3).toString('hex')}`,
      url: siteUrl,
      redirect_url: new URL('/api/github/callback', siteUrl).href,
      setup_url: new URL('/settings/git', siteUrl).href,
      setup_on_update: true,
      public: false,
      default_permissions: { contents: 'read', metadata: 'read' },
      ...(reachable ? { hook_attributes: { url: new URL('/api/github/webhooks', siteUrl).href }, default_events: ['push'] } : {})
    })
  }
})
