export default defineEventHandler(async () => {
  const existingUser = await db.query.users.findFirst({ columns: { id: true } })
  return { required: !existingUser }
})
