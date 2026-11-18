import { eq } from 'drizzle-orm'
import { backupDestinationParamsSchema } from '#shared/schemas/backup-destination'
import { backupDestinations } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, backupDestinationParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const [destination] = await db.delete(backupDestinations)
    .where(eq(backupDestinations.id, result.data.id))
    .returning({ id: backupDestinations.id })
  if (!destination) {
    throw createError({ statusCode: 404, message: 'Destination not found.' })
  }

  setResponseStatus(event, 204)
})
