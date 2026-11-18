export default defineEventHandler(async () => {
  const [certificates, domains] = await Promise.all([
    db.query.certificates.findMany({
      columns: { id: true, hostnames: true, issuer: true, expiresAt: true, createdAt: true },
      orderBy: { expiresAt: 'asc' }
    }),
    db.query.domains.findMany({ columns: { hostname: true } })
  ])
  const usage = new Map<string, number>()
  for (const domain of domains) {
    const certificate = matchCertificate(certificates, domain.hostname)
    if (certificate) {
      usage.set(certificate.id, (usage.get(certificate.id) ?? 0) + 1)
    }
  }
  const siteHostname = siteDomain()
  const siteCertificate = siteHostname && matchCertificate(certificates, siteHostname)
  if (siteCertificate) {
    usage.set(siteCertificate.id, (usage.get(siteCertificate.id) ?? 0) + 1)
  }
  return certificates.map(certificate => ({ ...certificate, domainCount: usage.get(certificate.id) ?? 0 }))
})
