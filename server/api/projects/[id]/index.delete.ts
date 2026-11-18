import { eq } from 'drizzle-orm'
import { projectParamsSchema } from '#shared/schemas/project'
import { projects } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, projectParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { id } = result.data

  await db.transaction(async (tx) => {
    const [project] = await tx.delete(projects).where(eq(projects.id, id)).returning({ namespace: projects.namespace })

    if (!project) {
      throw createError({ statusCode: 404, message: 'Project not found.' })
    }

    await kubeFetch(`/api/v1/namespaces/${project.namespace}`, { method: 'DELETE' }).catch((error) => {
      if (!(error instanceof KubeError && error.statusCode === 404)) {
        throw error
      }
    })
  })

  setResponseStatus(event, 204)
})
