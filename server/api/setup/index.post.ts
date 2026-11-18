import { runWithTransaction } from '@better-auth/core/context'
import { setupSchema } from '#shared/schemas/setup'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, setupSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const body = result.data

  if (await db.query.users.findFirst({ columns: { id: true } })) {
    throw createError({ statusCode: 403, message: 'Harblet is already set up.' })
  }

  const auth = serverAuth(event)
  const context = await auth.$context
  const password = await context.password.hash(body.password)

  const user = await runWithTransaction(context.adapter, async () => {
    const user = await context.internalAdapter.createUser({
      name: body.name,
      email: body.email,
      emailVerified: false,
      role: 'admin'
    }, { method: 'email-password' })
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password
    })
    return user
  })

  const session = await createSession(event, user.id)
  await setSessionCookie(event, session.token)

  setResponseStatus(event, 204)
})
