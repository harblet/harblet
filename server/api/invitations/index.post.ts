import { randomBytes } from 'node:crypto'
import { and, eq, lte } from 'drizzle-orm'
import { invitationSchema } from '#shared/schemas/invitation'
import { invitations } from '../../database/schema'

const lifetime = 7 * 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const result = await readValidatedBody(event, invitationSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const body = result.data

  if (await db.query.users.findFirst({ where: { email: body.email }, columns: { id: true } })) {
    const message = 'This person is already a member.'
    throw createError({ statusCode: 409, message, data: { errors: [{ name: 'email', message }] } })
  }

  await db.delete(invitations).where(and(eq(invitations.email, body.email), lte(invitations.expiresAt, new Date())))

  try {
    const [invitation] = await db.insert(invitations)
      .values({
        ...body,
        inviterId: user.id,
        token: randomBytes(32).toString('base64url'),
        expiresAt: new Date(Date.now() + lifetime)
      })
      .returning({ id: invitations.id, token: invitations.token })
    setResponseStatus(event, 201)
    return invitation!
  } catch (error) {
    if (isUniqueViolation(error)) {
      const message = 'This email already has a pending invitation.'
      throw createError({ statusCode: 409, message, data: { errors: [{ name: 'email', message }] } })
    }
    throw error
  }
})
