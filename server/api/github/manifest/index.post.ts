import { randomBytes } from 'node:crypto'
import { githubConnectionSchema } from '#shared/schemas/git-connection'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, githubConnectionSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const { siteUrl } = useRuntimeConfig().public
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
      default_permissions: { contents: 'read', metadata: 'read' }
    })
  }
})
