import { domainSchema } from '#shared/schemas/domain'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, domainSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { hostname } = result.data
  const fail = (message: string) => createError({ statusCode: 409, message, data: { errors: [{ name: 'hostname', message }] } })

  if (await db.query.domains.findFirst({ where: { hostname }, columns: { id: true } })) {
    throw fail('This domain is already used by a service.')
  }
  if (!matchCertificate(await db.query.certificates.findMany(), hostname)) {
    throw fail('Upload a certificate for this domain under SSL Certificates first.')
  }

  await kubeFetch(`/apis/apps/v1/namespaces/${systemNamespace}/deployments/harblet`, {
    method: 'PATCH',
    contentType: 'application/strategic-merge-patch+json',
    body: { spec: { template: { spec: { containers: [{ name: 'harblet', env: [{ name: 'NUXT_PUBLIC_SITE_URL', value: `https://${hostname}` }] }] } } } }
  }).catch((error) => {
    if (error instanceof KubeError && error.statusCode === 404) {
      throw createError({ statusCode: 409, message: 'Harblet doesn\'t run inside the cluster here, so its domain can\'t be changed.' })
    }
    throw error
  })
  setResponseStatus(event, 204)
})
