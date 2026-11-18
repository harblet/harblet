import { deploymentParamsSchema } from '#shared/schemas/deployment'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, deploymentParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  await cancelDeployment(result.data.id)
  setResponseStatus(event, 204)
})
