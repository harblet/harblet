import { projectParamsSchema } from '#shared/schemas/project'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, projectParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { id } = result.data

  const project = await db.query.projects.findFirst({ where: { id } })

  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found.' })
  }

  return project
})
