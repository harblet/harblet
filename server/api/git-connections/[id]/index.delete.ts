import { eq } from 'drizzle-orm'
import { gitConnectionParamsSchema } from '#shared/schemas/git-connection'
import { gitConnections } from '../../../database/schema'

const logger = useLogger('api:git-connections')

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, gitConnectionParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const connection = await db.query.gitConnections.findFirst({ where: { id: result.data.id } })
  if (!connection) {
    throw createError({ statusCode: 404, message: 'Connection not found.' })
  }
  if (connection.provider === 'github') {
    await uninstallApp(connection).catch((error) => {
      logger.error(error)
      throw createError({ statusCode: 500, message: `Uninstalling the app from ${connection.owner} failed. Try again, or delete the app on GitHub and then remove the connection.` })
    })
  }
  await db.delete(gitConnections).where(eq(gitConnections.id, connection.id))

  setResponseStatus(event, 204)
})
