export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const backup = await createBackup(null, 'user', user.id)
  runBackup(backup.id)
  setResponseStatus(event, 201)
  return { id: backup.id }
})
