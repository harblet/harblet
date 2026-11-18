import { eq } from 'drizzle-orm'
import { backupSettingsSchema } from '#shared/schemas/backup'
import { isDatabase, serviceParamsSchema } from '#shared/schemas/service'
import { services } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, backupSettingsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { destinationId, schedule, retention } = result.data

  const service = await db.query.services.findFirst({ where: { id: params.data.id }, columns: { type: true } })
  if (!service || !isDatabase(service.type)) {
    throw createError({ statusCode: 404, message: 'Database not found.' })
  }
  if (!await db.query.backupDestinations.findFirst({ where: { id: destinationId }, columns: { id: true } })) {
    const message = 'This destination was removed. Choose another one.'
    throw createError({ statusCode: 400, message, data: { errors: [{ name: 'destinationId', message }] } })
  }

  await db.update(services)
    .set({ backupDestinationId: destinationId, backupSchedule: schedule, backupRetention: retention })
    .where(eq(services.id, params.data.id))

  setResponseStatus(event, 204)
})
