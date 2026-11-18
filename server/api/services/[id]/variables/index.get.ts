import { serviceParamsSchema } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const service = await db.query.services.findFirst({
    where: { id: result.data.id },
    columns: { id: true },
    with: {
      environmentVariables: {
        columns: { key: true, value: true },
        orderBy: { key: 'asc' }
      }
    }
  })

  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  return service.environmentVariables
})
