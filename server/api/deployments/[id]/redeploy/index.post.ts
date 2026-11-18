import { deploymentParamsSchema } from '#shared/schemas/deployment'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await getValidatedRouterParams(event, deploymentParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const deployment = await db.query.deployments.findFirst({
    where: { id: result.data.id },
    columns: { serviceId: true, image: true, imageDigest: true, commitSha: true, commitMessage: true, port: true, healthCheckPath: true, command: true },
    with: { environmentVariables: { columns: { key: true, value: true } } }
  })
  if (!deployment) {
    throw createError({ statusCode: 404, message: 'Deployment not found.' })
  }
  if (!deployment.imageDigest) {
    throw createError({ statusCode: 409, message: 'This deployment has no image digest to redeploy.' })
  }

  const redeployment = await deployService(deployment.serviceId, user.id, deployment)
  setResponseStatus(event, 201)
  return redeployment
})
