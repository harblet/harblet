import { projectParamsSchema } from '#shared/schemas/project'
import { serviceCreationSchema } from '#shared/schemas/service'
import { services } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const params = await getValidatedRouterParams(event, projectParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, serviceCreationSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const project = await db.query.projects.findFirst({ where: { id: params.data.id } })
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found.' })
  }

  const { data } = result
  if (data.type === 'git' && data.gitConnectionId && !await db.query.gitConnections.findFirst({ where: { id: data.gitConnectionId }, columns: { id: true } })) {
    const message = 'This Git connection was removed. Choose the repository again.'
    throw createError({ statusCode: 400, message, data: { errors: [{ name: 'repository', message }] } })
  }
  if (data.type === 'image' && !data.worker && !data.port) {
    data.port = await imagePort(data.image)
  }
  const [service] = await db.insert(services).values(serviceValues(project.id, data)).returning()
  await deployService(service!.id, user.id)
  setResponseStatus(event, 201)
  return service!
})
