export default defineEventHandler(() => {
  return db.query.projects.findMany({
    orderBy: { name: 'asc' },
    with: { services: { columns: { id: true } } }
  })
})
