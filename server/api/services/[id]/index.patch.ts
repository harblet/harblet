import { eq } from 'drizzle-orm'
import { databaseSettingsSchema, gitSettingsSchema, isDatabase, serviceParamsSchema, serviceSettingsSchema } from '#shared/schemas/service'
import { services } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }

  const { id } = params.data
  const existing = await db.query.services.findFirst({ where: { id }, columns: { type: true } })
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  if (isDatabase(existing.type)) {
    const result = await readValidatedBody(event, databaseSettingsSchema.safeParse)
    if (!result.success) {
      throw validationError(result.error)
    }
    await db.update(services).set({ name: result.data.name }).where(eq(services.id, id))
    setResponseStatus(event, 204)
    return
  }

  let settings
  if (existing.type === 'git') {
    const result = await readValidatedBody(event, gitSettingsSchema.safeParse)
    if (!result.success) {
      throw validationError(result.error)
    }
    const { name, repository, gitConnectionId, branch, rootDirectory, dockerfilePath, port, healthCheckPath, startTimeout } = result.data
    if (gitConnectionId && !await db.query.gitConnections.findFirst({ where: { id: gitConnectionId }, columns: { id: true } })) {
      const message = 'This Git connection was removed. Choose the repository again.'
      throw createError({ statusCode: 400, message, data: { errors: [{ name: 'repository', message }] } })
    }
    settings = { name, repository, gitConnectionId: gitConnectionId ?? null, branch, rootDirectory: rootDirectory || null, dockerfilePath: dockerfilePath || null, port: port ?? null, healthCheckPath: healthCheckPath || null, startTimeout }
  } else {
    const result = await readValidatedBody(event, serviceSettingsSchema.safeParse)
    if (!result.success) {
      throw validationError(result.error)
    }
    const { name, image, port, command, healthCheckPath, startTimeout } = result.data
    settings = { name, image, port: port ?? null, command: command || null, healthCheckPath: healthCheckPath || null, startTimeout }
  }

  if (!settings.port && await db.query.domains.findFirst({ where: { serviceId: id }, columns: { id: true } })) {
    const message = 'Remove the service\'s domains before removing its port.'
    throw createError({ statusCode: 409, message, data: { errors: [{ name: 'port', message }] } })
  }

  const [service] = await db.update(services)
    .set(settings)
    .where(eq(services.id, id))
    .returning({ id: services.id })
  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }

  setResponseStatus(event, 204)
})
