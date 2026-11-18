import { z } from 'zod'
import { setupSchema } from './setup'

export const accountSchema = setupSchema.pick({ name: true })

export const passwordSchema = z.object({
  currentPassword: z.string({ error: 'Enter your current password' }).min(1, 'Enter your current password'),
  newPassword: setupSchema.shape.password
})
