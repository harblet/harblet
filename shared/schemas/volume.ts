import { z } from 'zod'

export const volumeParamsSchema = z.object({
  id: z.uuidv7('Invalid volume ID')
})

export const volumeSchema = z.object({
  mountPath: z.string({ error: 'Enter a path' })
    .trim()
    .min(1, 'Enter a path')
    .max(1024, 'Use at most 1,024 characters')
    .regex(/^(\/[^\s/:]+)+$/, 'Enter a path like /data, without spaces or a slash at the end')
    .refine(value => value.split('/').every(segment => segment !== '.' && segment !== '..'), 'Enter a path like /data, without . or ..')
})
