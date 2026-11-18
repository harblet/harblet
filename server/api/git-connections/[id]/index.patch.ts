import { eq } from 'drizzle-orm'
import { gitConnectionParamsSchema, gitlabTokenSchema } from '#shared/schemas/git-connection'
import { gitConnections } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, gitConnectionParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, gitlabTokenSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const connection = await db.query.gitConnections.findFirst({ where: { id: params.data.id } })
  if (!connection) {
    throw createError({ statusCode: 404, message: 'Connection not found.' })
  }
  if (connection.provider !== 'gitlab') {
    throw createError({ statusCode: 400, message: 'Only GitLab connections have a token to replace.' })
  }

  const { token } = result.data
  await db.update(gitConnections)
    .set({ ...await inspectGitlabToken(gitlabConfig(connection).url, token), credentials: token })
    .where(eq(gitConnections.id, connection.id))

  setResponseStatus(event, 204)
})
