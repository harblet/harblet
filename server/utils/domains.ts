import { eq } from 'drizzle-orm'
import { projects } from '../database/schema'

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function domainError(field: string, message: string) {
  return createError({ statusCode: 409, message, data: { errors: [{ name: field, message }] } })
}

export async function checkDomain(hostname: string, admin: boolean, field: string) {
  if (hostname === siteDomain()) {
    throw domainError(field, 'This domain is used by Harblet itself.')
  }
  if (!matchCertificate(await db.query.certificates.findMany({ columns: { hostnames: true, expiresAt: true } }), hostname)) {
    throw domainError(field, admin
      ? 'Upload a certificate for this domain under SSL Certificates first.'
      : 'Ask an admin to upload a certificate for this domain first.')
  }
}

export function domainTaken(field: string) {
  return domainError(field, 'This domain is already used by a service.')
}

export async function syncDomains(tx: Transaction, projectId: string) {
  const [project] = await tx.select({ namespace: projects.namespace }).from(projects).where(eq(projects.id, projectId)).for('update')
  if (!project) {
    return
  }
  const { namespace } = project
  const services = await tx.query.services.findMany({
    where: { projectId, worker: false },
    columns: { hostname: true },
    with: { domains: { columns: { id: true, hostname: true } } }
  })
  const certificates = await tx.query.certificates.findMany()
  const used = new Map<string, typeof certificates[number]>()

  const ingresses = services.flatMap(service => service.domains.map((domain) => {
    const certificate = matchCertificate(certificates, domain.hostname)
    if (certificate) {
      used.set(certificate.id, certificate)
    }
    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: domain.hostname,
        namespace,
        labels: {
          'app.kubernetes.io/name': service.hostname,
          'app.kubernetes.io/managed-by': 'harblet',
          'harblet.com/domain': domain.id
        },
        annotations: { 'traefik.ingress.kubernetes.io/router.entrypoints': 'websecure' }
      },
      spec: {
        ingressClassName: 'traefik',
        tls: certificate ? [{ hosts: [domain.hostname], secretName: `certificate-${certificate.id}` }] : undefined,
        rules: [{
          host: domain.hostname,
          http: {
            paths: [{
              path: '/',
              pathType: 'Prefix',
              backend: { service: { name: service.hostname, port: { name: 'http' } } }
            }]
          }
        }]
      }
    }
  }))

  for (const certificate of used.values()) {
    await kubeApply({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `certificate-${certificate.id}`,
        namespace,
        labels: { 'app.kubernetes.io/managed-by': 'harblet', 'harblet.com/certificate': certificate.id }
      },
      type: 'kubernetes.io/tls',
      data: {
        'tls.crt': Buffer.from(certificate.certificate).toString('base64'),
        'tls.key': Buffer.from(certificate.privateKey).toString('base64')
      }
    })
  }
  for (const ingress of ingresses) {
    await kubeApply(ingress)
  }

  await deleteUnused(`/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses`, 'harblet.com/domain', ingresses.map(ingress => ingress.metadata.labels['harblet.com/domain']))
  await deleteUnused(`/api/v1/namespaces/${namespace}/secrets`, 'harblet.com/certificate', [...used.keys()])
}

export async function syncCertificateDomains(tx: Transaction, hostnames: string[]) {
  const certificates = await tx.query.certificates.findMany()
  const domains = (await tx.query.domains.findMany({
    columns: { hostname: true },
    with: { service: { columns: { projectId: true } } }
  })).filter(domain => coversHostname(hostnames, domain.hostname))
  const unsecured = domains.filter(domain => !matchCertificate(certificates, domain.hostname))
  if (unsecured.length) {
    const others = unsecured.length - 1
    throw createError({
      statusCode: 409,
      message: `This certificate secures ${unsecured[0]!.hostname}${others ? ` and ${others} more ${others === 1 ? 'domain' : 'domains'}` : ''}. Upload its replacement or remove ${others ? 'the domains' : 'the domain'} first.`
    })
  }

  const siteHostname = siteDomain()
  if (siteHostname && coversHostname(hostnames, siteHostname)) {
    const certificate = matchCertificate(certificates, siteHostname)
    if (!certificate) {
      throw createError({ statusCode: 409, message: `This certificate secures Harblet's own domain, ${siteHostname}. Upload its replacement first.` })
    }
    await applySiteDomain(siteHostname, certificate)
  }

  const projectIds = new Set(domains.map(domain => domain.service.projectId))
  for (const projectId of projectIds) {
    await syncDomains(tx, projectId)
  }
}

function deleteUnused(path: string, label: string, keep: string[]) {
  const labelSelector = keep.length ? `${label},${label} notin (${keep.join(',')})` : label
  return kubeFetch(`${path}?${new URLSearchParams({ labelSelector })}`, { method: 'DELETE' })
}
