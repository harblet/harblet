import { gitlabConnectionSchema } from '#shared/schemas/git-connection'
import { gitConnections } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, gitlabConnectionSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const { url, token } = result.data
  const [connection] = await db.insert(gitConnections).values({
    provider: 'gitlab',
    ...await inspectGitlabToken(url, token),
    config: { url },
    credentials: token
  }).returning()

  setResponseStatus(event, 201)
  return { id: connection!.id, provider: connection!.provider, name: connection!.name, owner: connection!.owner }
})
