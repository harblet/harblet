export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { name: user.name, email: user.email, role: user.role }
})
