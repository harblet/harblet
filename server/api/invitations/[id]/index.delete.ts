import { eq } from 'drizzle-orm'
import { invitationParamsSchema } from '#shared/schemas/invitation'
import { invitations } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, invitationParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const [invitation] = await db.delete(invitations)
    .where(eq(invitations.id, result.data.id))
    .returning({ id: invitations.id })
  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invitation not found.' })
  }

  setResponseStatus(event, 204)
})
