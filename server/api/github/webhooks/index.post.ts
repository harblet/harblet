import { createHmac, timingSafeEqual } from 'node:crypto'
import { githubPushSchema } from '#shared/schemas/git-connection'

export default defineEventHandler(async (event) => {
  const body = await readRawBody(event, false)
  const appId = Number(getHeader(event, 'x-github-hook-installation-target-id'))
  const connections = await db.query.gitConnections.findMany({ where: { provider: 'github' } })
  const connection = connections.find(connection => githubConfig(connection).appId === appId)
  const signature = Buffer.from(getHeader(event, 'x-hub-signature-256') ?? '')
  const expected = Buffer.from(`sha256=${createHmac('sha256', connection?.webhookSecret ?? '').update(body ?? '').digest('hex')}`)
  if (!connection?.webhookSecret || signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw createError({ statusCode: 401, message: 'Invalid signature.' })
  }

  setResponseStatus(event, 204)
  if (getHeader(event, 'x-github-event') !== 'push') {
    return
  }
  const result = await readValidatedBody(event, githubPushSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { ref, deleted, repository } = result.data
  if (deleted) {
    return
  }

  const services = await db.query.services.findMany({
    where: { gitConnectionId: connection.id, autoDeploy: true },
    columns: { id: true, repository: true, branch: true }
  })
  for (const service of services) {
    if (`refs/heads/${service.branch}` === ref && service.repository?.toLowerCase().replace(/(\.git)?\/?$/, '') === repository.html_url.toLowerCase()) {
      await deployService(service.id, null, undefined, 'push')
    }
  }
})
