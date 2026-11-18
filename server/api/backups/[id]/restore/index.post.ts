import { backupParamsSchema } from '#shared/schemas/backup'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await getValidatedRouterParams(event, backupParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const restore = await createRestore(result.data.id, user.id)
  runRestore(restore.id)
  setResponseStatus(event, 201)
  return { id: restore.id }
})
