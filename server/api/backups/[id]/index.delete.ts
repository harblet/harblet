import { backupParamsSchema } from '#shared/schemas/backup'

const logger = useLogger('api:backups')

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await getValidatedRouterParams(event, backupParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const backup = await db.query.backups.findFirst({ where: { id: result.data.id }, with: { destination: true } })
  if (!backup || (!backup.serviceId && user.role !== 'admin')) {
    throw createError({ statusCode: 404, message: 'Backup not found.' })
  }
  if (backup.status === 'running') {
    throw createError({ statusCode: 409, message: 'Wait for the backup to finish before deleting it.' })
  }
  if (await db.query.restores.findFirst({ where: { backupId: backup.id, status: 'running' }, columns: { id: true } })) {
    throw createError({ statusCode: 409, message: 'Wait for the restore to finish before deleting this backup.' })
  }
  await deleteBackup(backup).catch((error) => {
    logger.error(error)
    throw createError({ statusCode: 502, message: `Deleting the file from ${backup.destination.name} failed: ${error.message}` })
  })

  setResponseStatus(event, 204)
})
