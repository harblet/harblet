export default defineEventHandler(async () => {
  const [destinations, system] = await Promise.all([
    db.query.backupDestinations.findMany({
      columns: { id: true, provider: true, name: true, config: true, createdAt: true },
      orderBy: { name: 'asc' },
      with: { services: { columns: { id: true } } }
    }),
    db.query.settings.findFirst({ columns: { backupDestinationId: true } })
  ])
  return destinations.map(({ services, ...destination }) => ({
    ...destination,
    databaseCount: services.length + (system?.backupDestinationId === destination.id ? 1 : 0)
  }))
})
