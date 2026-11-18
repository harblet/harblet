import { logsQuerySchema, serviceParamsSchema } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const query = await getValidatedQuery(event, logsQuerySchema.safeParse)
  if (!query.success) {
    throw validationError(query.error)
  }

  const service = await db.query.services.findFirst({
    where: { id: result.data.id },
    columns: { hostname: true },
    with: { project: { columns: { namespace: true } } }
  })

  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  const stream = createEventStream(event)
  const controller = new AbortController()
  const keepalive = setInterval(() => stream.push({ event: 'ping', data: '' }), 30000)
  stream.onClosed(() => {
    clearInterval(keepalive)
    controller.abort()
  })

  streamLogs(stream, service.project.namespace, service.hostname, query.data.instance, getHeader(event, 'last-event-id'), controller.signal)
    .catch(async (error) => {
      if (!controller.signal.aborted) {
        useLogger('api:services:[id]:logs:index.get').error(error)
        await stream.push({ event: 'failure', data: '', retry: 10000 })
      }
    })
    .finally(() => stream.close())

  return stream.send()
})
