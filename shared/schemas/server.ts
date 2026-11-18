import { z } from 'zod'

export const serverParamsSchema = z.object({
  name: z.string().regex(/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/, 'Invalid server name')
})

export const joinTokenParamsSchema = z.object({
  token: z.string().regex(/^[a-z0-9]{6}\.[a-z0-9]{16}$/, 'Invalid join token')
})
