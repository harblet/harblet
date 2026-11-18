import { eq } from 'drizzle-orm'
import { accountSchema } from '#shared/schemas/account'
import { users } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await readValidatedBody(event, accountSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  await db.update(users).set({ name: result.data.name }).where(eq(users.id, user.id))

  setResponseStatus(event, 204)
})
