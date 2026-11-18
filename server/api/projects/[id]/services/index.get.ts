import { projectParamsSchema } from '#shared/schemas/project'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, projectParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { id } = result.data

  const project = await db.query.projects.findFirst({
    where: { id },
    columns: { id: true },
    with: {
      services: {
        orderBy: { name: 'asc' },
        columns: { databasePassword: false },
        with: {
          deployments: {
            columns: { id: true, status: true },
            orderBy: { id: 'desc' },
            limit: 1
          }
        }
      }
    }
  })

  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found.' })
  }

  return project.services
})
