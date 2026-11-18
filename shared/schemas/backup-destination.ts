import { z } from 'zod'

export const backupDestinationParamsSchema = z.object({
  id: z.uuidv7('Invalid destination ID')
})

export const s3DestinationSchema = z.object({
  name: z.string({ error: 'Enter a name' }).trim().min(1, 'Enter a name').max(64, 'Use at most 64 characters'),
  endpoint: z.string({ error: 'Enter a URL' })
    .trim()
    .max(2048, 'Use at most 2,048 characters')
    .regex(/^(https?:\/\/[^\s@]+)?$/, 'Enter a URL that starts with https://')
    .nullish(),
  region: z.string({ error: 'Enter a region' })
    .trim()
    .min(1, 'Enter a region')
    .max(64, 'Use at most 64 characters')
    .regex(/^[\w-]+$/, 'Enter a region like eu-central-1'),
  bucket: z.string({ error: 'Enter a bucket' })
    .trim()
    .min(1, 'Enter a bucket')
    .max(255, 'Use at most 255 characters')
    .regex(/^[\w.-]+$/, 'Enter the bucket name without s3:// or slashes'),
  prefix: z.string({ error: 'Enter a folder' })
    .trim()
    .max(512, 'Use at most 512 characters')
    .regex(/^([\w.-]+(\/[\w.-]+)*)?$/, 'Use a folder inside the bucket, like harblet/backups')
    .nullish(),
  accessKeyId: z.string({ error: 'Enter the access key ID' }).trim().min(1, 'Enter the access key ID').max(256, 'Use at most 256 characters'),
  secretAccessKey: z.string({ error: 'Enter the secret access key' }).trim().min(1, 'Enter the secret access key').max(1024, 'Use at most 1,024 characters')
})
