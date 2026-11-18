import { eq } from 'drizzle-orm'
import { memberParamsSchema, memberRoleSchema } from '#shared/schemas/member'
import { users } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const params = await getValidatedRouterParams(event, memberParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, memberRoleSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  if (params.data.id === user.id) {
    throw createError({ statusCode: 403, message: 'You can\'t change your own role.' })
  }

  const [member] = await db.update(users)
    .set({ role: result.data.role })
    .where(eq(users.id, params.data.id))
    .returning({ id: users.id })
  if (!member) {
    throw createError({ statusCode: 404, message: 'Member not found.' })
  }

  setResponseStatus(event, 204)
})
