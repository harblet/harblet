import { githubCallbackSchema } from '#shared/schemas/git-connection'
import { gitConnections } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedQuery(event, githubCallbackSchema.safeParse)
  const state = getCookie(event, 'github-state')
  deleteCookie(event, 'github-state', { path: '/api/github' })
  if (!result.success || !state || result.data.state !== state) {
    return sendRedirect(event, `/settings/git?error=${encodeURIComponent('Connecting GitHub failed. Try again.')}`)
  }

  try {
    const [connection] = await db.insert(gitConnections).values(await convertManifest(result.data.code)).returning()
    return sendRedirect(event, `https://github.com/apps/${githubConfig(connection!).slug}/installations/new`)
  } catch (error) {
    return sendRedirect(event, `/settings/git?error=${encodeURIComponent((error as Error).message)}`)
  }
})
