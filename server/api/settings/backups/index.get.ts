export default defineEventHandler(() => {
  return db.query.backups.findMany({
    where: { serviceId: { isNull: true } },
    columns: { id: true, trigger: true, status: true, size: true, error: true, createdAt: true, finishedAt: true },
    orderBy: { id: 'desc' },
    limit: 200,
    with: {
      user: { columns: { id: true, name: true, image: true } },
      destination: { columns: { name: true } }
    }
  })
})
