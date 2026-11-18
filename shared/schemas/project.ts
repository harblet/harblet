import { z } from 'zod'

export const projectParamsSchema = z.object({
  id: z.uuidv7('Invalid project ID')
})

export const projectSchema = z.object({
  name: z.string({ error: 'Enter a name' }).trim().min(1, 'Enter a name').max(64, 'Use at most 64 characters')
})
