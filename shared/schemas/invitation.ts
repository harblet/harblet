import { z } from 'zod'
import { memberRoleSchema } from './member'
import { setupSchema } from './setup'

export const invitationSchema = memberRoleSchema.extend({
  email: z.email({ error: issue => issue.input ? 'Enter a valid email' : 'Enter an email' }).toLowerCase()
})

export const invitationParamsSchema = z.object({
  id: z.uuidv7('Invalid invitation ID')
})

export const joinParamsSchema = z.object({
  token: z.string('Invalid invitation link')
})

export const joinSchema = setupSchema.omit({ email: true })
