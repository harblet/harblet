export default defineEventHandler(async () => {
  const [system, destinations] = await Promise.all([
    db.query.settings.findFirst({ columns: { backupDestinationId: true, backupSchedule: true, backupRetention: true } }),
    db.query.backupDestinations.findMany({ columns: { id: true, name: true }, orderBy: { name: 'asc' } })
  ])

  return {
    destinationId: system?.backupDestinationId ?? null,
    schedule: system?.backupSchedule ?? 'off',
    retention: system?.backupRetention ?? 7,
    destinations
  }
})
