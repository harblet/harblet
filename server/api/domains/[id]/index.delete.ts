import { eq } from 'drizzle-orm'
import { domainParamsSchema } from '#shared/schemas/domain'
import { domains } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, domainParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  await db.transaction(async (tx) => {
    const [domain] = await tx.delete(domains).where(eq(domains.id, result.data.id)).returning({ serviceId: domains.serviceId })
    if (!domain) {
      throw createError({ statusCode: 404, message: 'Domain not found.' })
    }
    const service = await tx.query.services.findFirst({ where: { id: domain.serviceId }, columns: { projectId: true } })
    await syncDomains(tx, service!.projectId)
  })

  setResponseStatus(event, 204)
})
