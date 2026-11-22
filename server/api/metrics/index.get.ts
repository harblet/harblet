import { metricsQuerySchema } from '#shared/schemas/metric'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, metricsQuerySchema.safeParse)
  if (!query.success) {
    throw validationError(query.error)
  }

  return listServerMetrics(query.data.range)
})
