import { isDatabase, serviceParamsSchema } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const [service, destinations] = await Promise.all([
    db.query.services.findFirst({
      where: { id: result.data.id },
      columns: { type: true, backupDestinationId: true, backupSchedule: true, backupRetention: true }
    }),
    db.query.backupDestinations.findMany({ columns: { id: true, name: true }, orderBy: { name: 'asc' } })
  ])
  if (!service || !isDatabase(service.type)) {
    throw createError({ statusCode: 404, message: 'Database not found.' })
  }

  return {
    destinationId: service.backupDestinationId,
    schedule: service.backupSchedule,
    retention: service.backupRetention,
    destinations
  }
})
