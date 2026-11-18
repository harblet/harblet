import { deployHookParamsSchema, isDatabase } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, deployHookParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const service = await db.query.services.findFirst({ where: { deployHookToken: result.data.token }, columns: { id: true, type: true } })
  if (!service || isDatabase(service.type)) {
    throw createError({ statusCode: 404, message: 'Deploy hook not found.' })
  }

  const deployment = await deployService(service.id, null)
  if (deployment!.status === 'failed') {
    throw createError({ statusCode: 500, message: 'The deployment failed to start.', data: { id: deployment!.id, status: deployment!.status } })
  }
  setResponseStatus(event, 201)
  return { id: deployment!.id, status: deployment!.status }
})
