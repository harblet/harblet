import { z } from 'zod'

export const certificateParamsSchema = z.object({
  id: z.uuidv7('Invalid certificate ID')
})

export const certificateSchema = z.object({
  certificate: z.string({ error: 'Paste the certificate' }).trim().min(1, 'Paste the certificate').max(65536, 'Use at most 65,536 characters'),
  privateKey: z.string({ error: 'Paste the private key' }).trim().min(1, 'Paste the private key').max(16384, 'Use at most 16,384 characters')
})
