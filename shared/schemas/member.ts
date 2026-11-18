import { z } from 'zod'

export const memberParamsSchema = z.object({
  id: z.uuidv7('Invalid member ID')
})

export const memberRoleSchema = z.object({
  role: z.enum(['admin', 'user'], { error: 'Choose admin or member' })
})
