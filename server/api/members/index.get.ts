export default defineEventHandler(async () => {
  return db.query.users.findMany({
    columns: { id: true, name: true, email: true, image: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  })
})
