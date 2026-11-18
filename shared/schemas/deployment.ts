import { z } from 'zod'

export const deploymentParamsSchema = z.object({
  id: z.uuidv7('Invalid deployment ID')
})
