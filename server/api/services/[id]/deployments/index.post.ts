import { serviceParamsSchema } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const service = await db.query.services.findFirst({ where: { id: result.data.id } })
  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  const deployment = await deployService(service.id, user.id)
  setResponseStatus(event, 201)
  return deployment
})
