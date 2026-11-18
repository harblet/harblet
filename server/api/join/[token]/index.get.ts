import { joinParamsSchema } from '#shared/schemas/invitation'

export default defineEventHandler(async (event) => {
  const result = await getValidatedRouterParams(event, joinParamsSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const invitation = await db.query.invitations.findFirst({
    where: { token: result.data.token, expiresAt: { gt: new Date() } },
    columns: { email: true, role: true },
    with: { inviter: { columns: { name: true } } }
  })
  if (!invitation) {
    throw createError({ statusCode: 404, message: 'This invitation link is invalid or has expired.' })
  }

  return invitation
})
