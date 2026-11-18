import { eq } from 'drizzle-orm'
import { volumeParamsSchema } from '#shared/schemas/volume'
import { volumes } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, volumeParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const [volume] = await db.delete(volumes).where(eq(volumes.id, result.data.id)).returning({ id: volumes.id })
  if (!volume) {
    throw createError({ statusCode: 404, message: 'Volume not found.' })
  }

  setResponseStatus(event, 204)
})
