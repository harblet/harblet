import { and, eq, notInArray, sql } from 'drizzle-orm'
import { isDatabase, serviceParamsSchema } from '#shared/schemas/service'
import { variablesSchema } from '#shared/schemas/variable'
import { environmentVariables, services } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, serviceParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, variablesSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const { variables } = result.data
  await db.transaction(async (tx) => {
    const [service] = await tx.select({ id: services.id, type: services.type }).from(services).where(eq(services.id, params.data.id)).for('update')
    if (!service) {
      throw createError({ statusCode: 404, message: 'Service not found.' })
    }
    if (isDatabase(service.type)) {
      throw createError({ statusCode: 409, message: 'Databases don\'t use environment variables.' })
    }
    await tx.delete(environmentVariables).where(and(
      eq(environmentVariables.serviceId, service.id),
      notInArray(environmentVariables.key, variables.map(({ key }) => key))
    ))
    if (variables.length) {
      await tx.insert(environmentVariables)
        .values(variables.map(({ key, value }) => ({ serviceId: service.id, key, value })))
        .onConflictDoUpdate({
          target: [environmentVariables.serviceId, environmentVariables.key],
          set: { value: sql`excluded.value` }
        })
    }
  })

  setResponseStatus(event, 204)
})
