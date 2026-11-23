import { deployHookParamsSchema, deployHookPushSchema, isDatabase } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, deployHookParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const service = await db.query.services.findFirst({ where: { deployHookToken: result.data.token }, columns: { id: true, type: true, branch: true } })
  if (!service || isDatabase(service.type)) {
    throw createError({ statusCode: 404, message: 'Deploy hook not found.' })
  }

  const push = service.type === 'git' ? deployHookPushSchema.safeParse(await readBody(event).catch(() => undefined)) : undefined
  if (push?.success && push.data.ref !== `refs/heads/${service.branch}`) {
    setResponseStatus(event, 204)
    return
  }

  const deployment = await deployService(service.id, null, undefined, push?.success ? 'push' : 'hook')
  if (deployment!.status === 'failed') {
    throw createError({ statusCode: 500, message: 'The deployment failed to start.', data: { id: deployment!.id, status: deployment!.status } })
  }
  setResponseStatus(event, 201)
  return { id: deployment!.id, status: deployment!.status }
})
