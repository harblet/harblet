import { eq } from 'drizzle-orm'
import { memberParamsSchema } from '#shared/schemas/member'
import { users } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await getValidatedRouterParams(event, memberParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  if (result.data.id === user.id) {
    throw createError({ statusCode: 403, message: 'You can\'t remove yourself.' })
  }

  const [member] = await db.delete(users)
    .where(eq(users.id, result.data.id))
    .returning({ id: users.id })
  if (!member) {
    throw createError({ statusCode: 404, message: 'Member not found.' })
  }

  setResponseStatus(event, 204)
})
