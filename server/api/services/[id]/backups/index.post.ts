import { serviceParamsSchema } from '#shared/schemas/service'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const backup = await createBackup(result.data.id, 'user', user.id)
  runBackup(backup.id)
  setResponseStatus(event, 201)
  return { id: backup.id }
})
