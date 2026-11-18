import { isDatabase, serviceParamsSchema } from '#shared/schemas/service'
import { volumeSchema } from '#shared/schemas/volume'
import { volumes } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, volumeSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const service = await db.query.services.findFirst({ where: { id: params.data.id }, columns: { id: true, type: true, instances: true } })
  if (!service) {
    throw createError({ statusCode: 404, message: 'Service not found.' })
  }
  if (isDatabase(service.type)) {
    throw createError({ statusCode: 409, message: 'A database already keeps its data in its own volume.' })
  }
  if (service.instances > 1) {
    const message = 'Set the service to one instance first. A volume lives on one server.'
    throw createError({ statusCode: 409, message, data: { errors: [{ name: 'mountPath', message }] } })
  }

  try {
    const [volume] = await db.insert(volumes)
      .values({ serviceId: service.id, mountPath: result.data.mountPath })
      .returning({ id: volumes.id, mountPath: volumes.mountPath, createdAt: volumes.createdAt })
    setResponseStatus(event, 201)
    return volume!
  } catch (error) {
    if (isUniqueViolation(error)) {
      const message = 'This path already has a volume.'
      throw createError({ statusCode: 409, message, data: { errors: [{ name: 'mountPath', message }] } })
    }
    throw error
  }
})
