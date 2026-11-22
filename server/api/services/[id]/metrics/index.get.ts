import { metricsQuerySchema } from '#shared/schemas/metric'
import { serviceParamsSchema } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const query = await getValidatedQuery(event, metricsQuerySchema.safeParse)
  if (!query.success) {
    throw validationError(query.error)
  }

  const service = await db.query.services.findFirst({ where: { id: result.data.id }, columns: { id: true } })
  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  return getServiceMetrics(service.id, query.data.range)
})
