import { certificates } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, parsedCertificateSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const certificate = await db.transaction(async (tx) => {
    const [certificate] = await tx.insert(certificates).values(result.data).returning({
      id: certificates.id,
      hostnames: certificates.hostnames,
      issuer: certificates.issuer,
      expiresAt: certificates.expiresAt,
      createdAt: certificates.createdAt
    })
    await syncCertificateDomains(tx, certificate!.hostnames)
    return certificate!
  })
  setResponseStatus(event, 201)
  return certificate
})
