import { runWithTransaction } from '@better-auth/core/context'
import { eq } from 'drizzle-orm'
import { joinParamsSchema, joinSchema } from '#shared/schemas/invitation'
import { invitations } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, joinParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, joinSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const body = result.data

  const invitation = await db.query.invitations.findFirst({
    where: { token: params.data.token, expiresAt: { gt: new Date() } },
    columns: { id: true, email: true, role: true }
  })
  if (!invitation) {
    throw createError({ statusCode: 404, message: 'This invitation link is invalid or has expired.' })
  }

  const memberExists = { statusCode: 409, message: 'An account with this email already exists. Log in instead.' }
  if (await db.query.users.findFirst({ where: { email: invitation.email }, columns: { id: true } })) {
    throw createError(memberExists)
  }

  const auth = serverAuth(event)
  const context = await auth.$context
  const password = await context.password.hash(body.password)

  let user
  try {
    user = await runWithTransaction(context.adapter, async () => {
      const user = await context.internalAdapter.createUser({
        name: body.name,
        email: invitation.email,
        emailVerified: false,
        role: invitation.role
      }, { method: 'email-password' })
      await context.internalAdapter.linkAccount({
        userId: user.id,
        providerId: 'credential',
        accountId: user.id,
        password
      })
      return user
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError(memberExists)
    }
    throw error
  }

  await db.delete(invitations).where(eq(invitations.id, invitation.id))

  const session = await createSession(event, user.id)
  await setSessionCookie(event, session.token)

  setResponseStatus(event, 204)
})
