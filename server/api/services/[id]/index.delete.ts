import { eq } from 'drizzle-orm'
import { serviceParamsSchema } from '#shared/schemas/service'
import { projects, services } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const { id } = result.data

  await db.transaction(async (tx) => {
    const [service] = await tx.select({ projectId: services.projectId, hostname: services.hostname })
      .from(services)
      .where(eq(services.id, id))
      .for('update')
    if (!service) {
      throw createError({ statusCode: 404, message: 'Service not found.' })
    }
    if (await tx.query.deployments.findFirst({ where: { serviceId: id, status: { in: ['building', 'deploying'] } }, columns: { id: true } })) {
      throw createError({ statusCode: 409, message: 'Wait for the running deployment to finish before deleting the service.' })
    }

    await tx.delete(services).where(eq(services.id, id))
    await syncDomains(tx, service.projectId)

    const [project] = await tx.select({ namespace: projects.namespace }).from(projects).where(eq(projects.id, service.projectId))
    const { namespace } = project!
    const labelSelector = `app.kubernetes.io/name=${service.hostname}`
    await kubeDelete(`/apis/apps/v1/namespaces/${namespace}/deployments/${service.hostname}`)
    await kubeDelete(`/apis/apps/v1/namespaces/${namespace}/statefulsets/${service.hostname}`)
    await kubeDelete(`/api/v1/namespaces/${namespace}/services/${service.hostname}`)
    await kubeDelete(`/api/v1/namespaces/${namespace}/secrets?${new URLSearchParams({ labelSelector })}`)
    await kubeDelete(`/api/v1/namespaces/${namespace}/persistentvolumeclaims?${new URLSearchParams({ labelSelector })}`)
  })
  await startQueuedDeployments()

  setResponseStatus(event, 204)
})
