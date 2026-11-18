import type { z } from 'zod'
import type { serviceCreationSchema } from '#shared/schemas/service'
import type { services } from '../database/schema'

export function serviceValues(projectId: string, data: z.output<typeof serviceCreationSchema>): typeof services.$inferInsert {
  const values = data.type === 'image'
    ? { image: data.image, port: data.port }
    : data.type === 'git'
      ? { repository: data.repository, gitConnectionId: data.gitConnectionId ?? null, branch: data.branch, rootDirectory: data.rootDirectory || null, dockerfilePath: data.dockerfilePath || null, port: data.port }
      : { image: `${data.type}:${data.version}`, databaseUser: data.databaseUser, databaseName: data.databaseName, databasePassword: generatePassword() }
  return { ...values, name: data.name, type: data.type, hostname: kubeName(data.name, 'service'), projectId }
}
