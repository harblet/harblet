import { z } from 'zod'

export const domainParamsSchema = z.object({
  id: z.uuidv7('Invalid domain ID')
})

export const domainSchema = z.object({
  hostname: z.string({ error: 'Enter a domain' })
    .trim()
    .toLowerCase()
    .min(1, 'Enter a domain')
    .max(253, 'Use at most 253 characters')
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/, 'Enter a domain like app.example.com, without https://')
})
