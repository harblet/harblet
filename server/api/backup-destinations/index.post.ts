import { s3DestinationSchema } from '#shared/schemas/backup-destination'
import { backupDestinations } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, s3DestinationSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const { name, endpoint, region, bucket, prefix, accessKeyId, secretAccessKey } = result.data

  try {
    const destination = await db.transaction(async (tx) => {
      const [destination] = await tx.insert(backupDestinations).values({
        provider: 's3',
        name,
        config: { endpoint: endpoint || null, region, bucket, prefix: prefix || null, accessKeyId },
        credentials: secretAccessKey
      }).returning()
      await testDestination(destination!)
      return destination!
    })
    setResponseStatus(event, 201)
    return { id: destination.id, provider: destination.provider, name: destination.name, config: destination.config, createdAt: destination.createdAt }
  } catch (error) {
    if (isUniqueViolation(error)) {
      const message = 'A destination with this name already exists.'
      throw createError({ statusCode: 409, message, data: { errors: [{ name: 'name', message }] } })
    }
    throw error
  }
})
