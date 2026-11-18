import type { Readable } from 'node:stream'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { backupParamsSchema } from '#shared/schemas/backup'

const logger = useLogger('api:backups')

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await getValidatedRouterParams(event, backupParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const backup = await db.query.backups.findFirst({ where: { id: result.data.id, status: 'succeeded' }, with: { destination: true } })
  if (!backup || (!backup.serviceId && user.role !== 'admin')) {
    throw createError({ statusCode: 404, message: 'Backup not found.' })
  }

  const client = s3Client(backup.destination)
  const object = await client.send(new GetObjectCommand({ Bucket: backup.destination.config.bucket, Key: backup.key })).catch((error) => {
    client.destroy()
    logger.error(error)
    throw createError({ statusCode: 502, message: `Reading the file from ${backup.destination.name} failed: ${error.message}` })
  })
  const body = object.Body as Readable
  body.on('close', () => client.destroy())

  setResponseHeaders(event, {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename="${backup.key.split('/').slice(-2).join('-')}"`
  })
  if (object.ContentLength !== undefined) {
    setResponseHeader(event, 'content-length', object.ContentLength)
  }
  return sendStream(event, body)
})
