import { deploymentParamsSchema } from '#shared/schemas/deployment'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, deploymentParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const deployment = await db.query.deployments.findFirst({
    where: { id: result.data.id },
    with: { user: { columns: { id: true, name: true, image: true } } }
  })

  if (!deployment) {
    throw createError({ statusCode: 404, message: 'Deployment not found.' })
  }

  return deployment
})
