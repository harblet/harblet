import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { backupDestinations } from '../database/schema'

type Destination = Pick<typeof backupDestinations.$inferSelect, 'config' | 'credentials'>

const testTimeout = 15_000

const testErrors: Record<string, { name: string, message: string }> = {
  NoSuchBucket: { name: 'bucket', message: 'This bucket doesn\'t exist.' },
  InvalidBucketName: { name: 'bucket', message: 'The storage doesn\'t accept this bucket name.' },
  InvalidAccessKeyId: { name: 'accessKeyId', message: 'The storage doesn\'t know this access key ID.' },
  SignatureDoesNotMatch: { name: 'secretAccessKey', message: 'The secret access key doesn\'t match the access key ID.' },
  AccessDenied: { name: 'accessKeyId', message: 'This access key isn\'t allowed to write to and delete from the bucket.' },
  AuthorizationHeaderMalformed: { name: 'region', message: 'The bucket is in another region.' },
  PermanentRedirect: { name: 'region', message: 'The bucket is in another region.' },
  TimeoutError: { name: 'endpoint', message: 'The storage didn\'t answer within 15 seconds.' },
  AbortError: { name: 'endpoint', message: 'The storage didn\'t answer within 15 seconds.' },
  ENOTFOUND: { name: 'endpoint', message: 'Harblet can\'t find this address.' },
  ECONNREFUSED: { name: 'endpoint', message: 'The storage refused the connection.' }
}

export function s3Client({ config, credentials }: Destination) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: !!config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: credentials },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  })
}

export function destinationKey({ config }: Destination, path: string) {
  return config.prefix ? `${config.prefix}/${path}` : path
}

export async function testDestination(destination: Destination) {
  const client = s3Client(destination)
  const object = { Bucket: destination.config.bucket, Key: destinationKey(destination, `harblet-test-${randomUUID()}`) }
  const abortSignal = AbortSignal.timeout(testTimeout)
  try {
    await client.send(new PutObjectCommand({ ...object, Body: 'Harblet connection test' }), { abortSignal })
    await client.send(new DeleteObjectCommand(object), { abortSignal })
  } catch (error) {
    const { name, code, message } = error as Error & { code?: string }
    const known = testErrors[name] ?? testErrors[code ?? '']
    const text = known?.message ?? `Connecting failed: ${message}`
    throw createError({ statusCode: 400, message: text, data: known && { errors: [{ name: known.name, message: text }] } })
  } finally {
    client.destroy()
  }
}
