import { joinTokenParamsSchema } from '#shared/schemas/server'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, joinTokenParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const script = await renderJoinScript(result.data.token)
  if (!script) {
    throw createError({ statusCode: 404, message: 'Join token not found.' })
  }
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return script
})
