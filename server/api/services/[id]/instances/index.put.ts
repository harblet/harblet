import { eq } from 'drizzle-orm'
import { instancesSchema, isDatabase, serviceParamsSchema } from '#shared/schemas/service'
import { services } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, instancesSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const { instances } = result.data
  const service = await db.query.services.findFirst({
    where: { id: params.data.id },
    columns: { id: true, type: true, hostname: true },
    with: { project: { columns: { namespace: true } }, volumes: { columns: { id: true } } }
  })
  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }
  if (isDatabase(service.type)) {
    throw createError({ statusCode: 409, message: 'A database runs as one instance.' })
  }
  if (instances > 1 && service.volumes.length) {
    const message = 'Remove the service\'s volumes to run more than one instance.'
    throw createError({ statusCode: 409, message, data: { errors: [{ name: 'instances', message }] } })
  }

  await db.update(services).set({ instances }).where(eq(services.id, service.id))
  await kubeFetch(`/apis/apps/v1/namespaces/${service.project.namespace}/deployments/${service.hostname}/scale`, {
    method: 'PATCH',
    body: { spec: { replicas: instances } },
    contentType: 'application/merge-patch+json'
  }).catch((error) => {
    if (!(error instanceof KubeError && error.statusCode === 404)) {
      throw error
    }
  })

  setResponseStatus(event, 204)
})
