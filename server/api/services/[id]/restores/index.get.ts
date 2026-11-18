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
      restores: {
        columns: { id: true, status: true, error: true, createdAt: true, finishedAt: true },
        orderBy: { id: 'desc' },
        limit: 20,
        with: {
          user: { columns: { id: true, name: true, image: true } },
          backup: { columns: { id: true, createdAt: true } }
        }
      }
    }
  })

  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  return service.restores
})
