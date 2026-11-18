import { serverParamsSchema } from '#shared/schemas/server'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, serverParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  await removeServer(result.data.name)
  setResponseStatus(event, 204)
})
