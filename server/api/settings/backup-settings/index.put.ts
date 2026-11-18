import { backupSettingsSchema } from '#shared/schemas/backup'
import { settings } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, backupSettingsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { destinationId, schedule, retention } = result.data

  if (!await db.query.backupDestinations.findFirst({ where: { id: destinationId }, columns: { id: true } })) {
    const message = 'This destination was removed. Choose another one.'
    throw createError({ statusCode: 400, message, data: { errors: [{ name: 'destinationId', message }] } })
  }

  const values = { backupDestinationId: destinationId, backupSchedule: schedule, backupRetention: retention }
  await db.insert(settings).values(values).onConflictDoUpdate({ target: settings.id, set: values })

  setResponseStatus(event, 204)
})
