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
      domains: {
        columns: { id: true, hostname: true, createdAt: true },
        orderBy: { hostname: 'asc' }
      }
    }
  })

  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  const certificates = await db.query.certificates.findMany({
    columns: { id: true, hostnames: true, issuer: true, expiresAt: true }
  })
  return service.domains.map((domain) => {
    const certificate = matchCertificate(certificates, domain.hostname)
    return { ...domain, certificate: certificate ? { id: certificate.id, issuer: certificate.issuer } : null }
  })
})
