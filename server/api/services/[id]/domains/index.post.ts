import { domainSchema } from '#shared/schemas/domain'
import { serviceParamsSchema } from '#shared/schemas/service'
import { domains } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const params = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, domainSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const service = await db.query.services.findFirst({
    where: { id: params.data.id },
    columns: { id: true, projectId: true, port: true }
  })
  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }
  if (!service.port) {
    throw createError({ statusCode: 409, message: 'This service has no port, so it can\'t receive web traffic.' })
  }
  await checkDomain(result.data.hostname, user.role === 'admin', 'hostname')

  try {
    const domain = await db.transaction(async (tx) => {
      const [domain] = await tx.insert(domains)
        .values({ serviceId: service.id, hostname: result.data.hostname })
        .returning({ id: domains.id, hostname: domains.hostname, createdAt: domains.createdAt })
      await syncDomains(tx, service.projectId)
      return domain!
    })
    setResponseStatus(event, 201)
    return domain
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw domainTaken('hostname')
    }
    throw error
  }
})
