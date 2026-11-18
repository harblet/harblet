import { eq } from 'drizzle-orm'
import { certificateParamsSchema } from '#shared/schemas/certificate'
import { certificates } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, certificateParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  await db.transaction(async (tx) => {
    const [certificate] = await tx.delete(certificates)
      .where(eq(certificates.id, result.data.id))
      .returning({ hostnames: certificates.hostnames })
    if (!certificate) {
      throw createError({ statusCode: 404, message: 'Certificate not found.' })
    }
    await syncCertificateDomains(tx, certificate.hostnames)
  })

  setResponseStatus(event, 204)
})
