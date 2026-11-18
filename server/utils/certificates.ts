import { X509Certificate, createPrivateKey } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { z } from 'zod'
import { certificateSchema } from '#shared/schemas/certificate'

const pemCertificate = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

export const parsedCertificateSchema = certificateSchema.transform((body, ctx) => {
  const fail = (path: 'certificate' | 'privateKey', message: string) => {
    ctx.addIssue({ code: 'custom', message, path: [path] })
    return z.NEVER
  }

  const blocks = body.certificate.match(pemCertificate)
  if (!blocks) {
    return fail('certificate', 'Paste a PEM certificate that starts with -----BEGIN CERTIFICATE-----')
  }
  let chain: X509Certificate[]
  try {
    chain = blocks.map(block => new X509Certificate(block))
  } catch {
    return fail('certificate', 'The certificate could not be read')
  }

  if (body.privateKey.includes('ENCRYPTED')) {
    return fail('privateKey', 'Remove the passphrase from the private key')
  }
  let key: KeyObject
  try {
    key = createPrivateKey(body.privateKey)
  } catch {
    return fail('privateKey', 'Paste a PEM private key that starts with -----BEGIN')
  }

  const leaf = chain.find(certificate => certificate.checkPrivateKey(key))
  if (!leaf) {
    return fail('privateKey', 'This private key does not belong to the certificate')
  }

  const hostnames = [...new Set(leaf.subjectAltName?.split(', ')
    .filter(name => name.startsWith('DNS:'))
    .map(name => name.slice(4).toLowerCase()))]
  if (!hostnames.length) {
    return fail('certificate', 'The certificate has no DNS names')
  }
  if (leaf.validToDate < new Date()) {
    return fail('certificate', 'The certificate has expired')
  }
  if (leaf.validFromDate > new Date()) {
    return fail('certificate', 'The certificate is not valid yet')
  }

  const issuer = Object.fromEntries(leaf.issuer.split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
  return {
    certificate: [leaf, ...chain.filter(certificate => certificate !== leaf)].map(String).join(''),
    privateKey: key.export({ type: 'pkcs8', format: 'pem' }) as string,
    hostnames,
    issuer: issuer.O ?? issuer.CN ?? 'Unknown',
    expiresAt: leaf.validToDate
  }
})

export function coversHostname(hostnames: string[], hostname: string) {
  return hostnames.includes(hostname) || hostnames.includes(`*.${hostname.slice(hostname.indexOf('.') + 1)}`)
}

export function matchCertificate<T extends { hostnames: string[], expiresAt: Date }>(certificates: T[], hostname: string) {
  const now = new Date()
  return certificates
    .filter(certificate => certificate.expiresAt > now && coversHostname(certificate.hostnames, hostname))
    .sort((a, b) => Number(b.hostnames.includes(hostname)) - Number(a.hostnames.includes(hostname))
      || b.expiresAt.getTime() - a.expiresAt.getTime())[0]
}
