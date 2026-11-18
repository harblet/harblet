import { z } from 'zod'

export const setupSchema = z.object({
  name: z.string({ error: 'Enter your name' }).trim().min(1, 'Enter your name').max(100, 'Use at most 100 characters'),
  email: z.email({ error: issue => issue.input ? 'Enter a valid email' : 'Enter your email' }),
  password: z.string({ error: 'Enter a password' }).min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters')
})
