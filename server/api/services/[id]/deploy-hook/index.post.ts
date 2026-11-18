import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { isDatabase, serviceParamsSchema } from '#shared/schemas/service'
import { services } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const service = await db.query.services.findFirst({ where: { id: result.data.id }, columns: { type: true } })
  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }
  if (isDatabase(service.type)) {
    throw createError({ statusCode: 409, message: 'Databases don\'t have deploy hooks.' })
  }

  const [updated] = await db.update(services)
    .set({ deployHookToken: randomUUID() })
    .where(eq(services.id, result.data.id))
    .returning({ deployHookToken: services.deployHookToken })

  setResponseStatus(event, 201)
  return updated
})
