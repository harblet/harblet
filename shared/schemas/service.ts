import { z } from 'zod'

export const databaseEngines = {
  postgres: {
    label: 'PostgreSQL',
    icon: 'i-logos-postgresql',
    versions: ['19', '18'],
    port: 5432,
    scheme: 'postgresql',
    defaultUser: 'postgres',
    reservedDatabases: ['template0', 'template1']
  },
  mysql: {
    label: 'MySQL',
    icon: 'i-logos-mysql-icon',
    versions: ['9.7', '8.4'],
    port: 3306,
    scheme: 'mysql',
    defaultUser: 'root',
    reservedDatabases: ['mysql', 'sys', 'information_schema', 'performance_schema']
  }
}

export type DatabaseType = keyof typeof databaseEngines

export function isDatabase(type: string): type is DatabaseType {
  return Object.hasOwn(databaseEngines, type)
}

export function databaseUrl(type: DatabaseType, service: { hostname: string, databaseUser?: string | null, databaseName?: string | null }, password: string) {
  const { port, scheme } = databaseEngines[type]
  return `${scheme}://${service.databaseUser}:${password}@${service.hostname}:${port}/${service.databaseName}`
}

export function splitCommand(command: string) {
  const args: string[] = []
  let current = ''
  let started = false
  let quote = ''
  for (let i = 0; i < command.length; i++) {
    const char = command[i]!
    const next = command[i + 1]
    if (quote ? char === quote : char === '"' || char === '\'') {
      quote = quote ? '' : char
      started = true
    } else if (char === '\\' && next !== undefined && (!quote || (quote === '"' && '"\\'.includes(next)))) {
      current += next
      started = true
      i++
    } else if (!quote && /\s/.test(char)) {
      if (started) {
        args.push(current)
      }
      current = ''
      started = false
    } else {
      current += char
      started = true
    }
  }
  if (quote) {
    return
  }
  return started ? [...args, current] : args
}

export const serviceParamsSchema = z.object({
  id: z.uuidv7('Invalid service ID')
})

export const deployHookParamsSchema = z.object({
  token: z.uuid('Invalid deploy hook')
})

export const deployHookPushSchema = z.object({
  ref: z.string()
})

export const serviceSchema = z.object({
  name: z.string({ error: 'Enter a name' }).trim().min(1, 'Enter a name').max(64, 'Use at most 64 characters'),
  image: z.string({ error: 'Enter an image' }).trim().min(1, 'Enter an image'),
  port: z.int('Enter a whole number').min(1, 'Use a port from 1 to 65535').max(65535, 'Use a port from 1 to 65535').nullish()
})

const identifier = (label: string, max: number) => z.string({ error: `Enter a ${label}` })
  .trim()
  .min(1, `Enter a ${label}`)
  .max(max, `Use at most ${max} characters`)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, digits and underscores, and start with a letter')

export const databaseSchema = z.object({
  type: z.enum(['postgres', 'mysql']),
  name: serviceSchema.shape.name,
  version: z.string({ error: 'Choose a version' }),
  databaseUser: identifier('username', 32),
  databaseName: identifier('database name', 63)
}).superRefine((data, ctx) => {
  const engine = databaseEngines[data.type]
  if (!engine.versions.includes(data.version)) {
    ctx.addIssue({ code: 'custom', message: 'Choose a version', path: ['version'] })
  }
  if (engine.reservedDatabases.includes(data.databaseName)) {
    ctx.addIssue({ code: 'custom', message: `${engine.label} reserves this name`, path: ['databaseName'] })
  }
  if (data.type === 'postgres' && data.databaseUser.startsWith('pg_')) {
    ctx.addIssue({ code: 'custom', message: 'Don\'t start with pg_', path: ['databaseUser'] })
  }
})

const repositoryPath = z.string({ error: 'Enter a path' })
  .trim()
  .max(1024, 'Use at most 1,024 characters')
  .regex(/^([\w.-]+(\/[\w.-]+)*)?$/, 'Use a path inside the repository, like apps/web')
  .refine(value => value.split('/').every(segment => segment !== '.' && segment !== '..'), 'Use a path inside the repository, like apps/web')

export const gitSchema = z.object({
  name: serviceSchema.shape.name,
  repository: z.string({ error: 'Enter a repository URL' })
    .trim()
    .min(1, 'Choose a repository or enter its URL')
    .max(2048, 'Use at most 2,048 characters')
    .regex(/^https:\/\/[^\s/@]+\/\S+$/, 'Enter an https:// URL without a username or password'),
  gitConnectionId: z.uuidv7('Choose the repository again').nullish(),
  branch: z.string({ error: 'Enter a branch' })
    .trim()
    .min(1, 'Enter a branch')
    .max(255, 'Use at most 255 characters')
    .regex(/^(?!.*(\.\.|\/\/|\.lock$|[/.]$))\w[\w./-]*$/, 'Enter a valid branch name'),
  rootDirectory: repositoryPath.nullish(),
  dockerfilePath: repositoryPath.nullish(),
  port: serviceSchema.shape.port
})

export const serviceCreationSchema = z.discriminatedUnion('type', [
  serviceSchema.extend({ type: z.literal('image') }),
  gitSchema.extend({ type: z.literal('git') }),
  databaseSchema
])

const healthCheckPath = z.string({ error: 'Enter a path' })
  .trim()
  .max(2048, 'Use at most 2,048 characters')
  .regex(/^(\/\S*)?$/, 'Start with / and don\'t use spaces')
  .nullish()

function hasPortForHealthCheck({ port, healthCheckPath }: { port?: number | null, healthCheckPath?: string | null }) {
  return !!port || !healthCheckPath
}

const healthCheckPortIssue = { message: 'Add a port to use a health check path', path: ['healthCheckPath'] }

const startTimeout = z.int('Enter a whole number').min(1, 'Use 1 to 60 minutes').max(60, 'Use 1 to 60 minutes')

const command = z.string({ error: 'Enter a command' })
  .trim()
  .max(2048, 'Use at most 2,048 characters')
  .refine(value => splitCommand(value), 'Close the open quote')
  .nullish()

export const serviceSettingsSchema = serviceSchema.extend({ command, healthCheckPath, startTimeout }).refine(hasPortForHealthCheck, healthCheckPortIssue)

export const gitSettingsSchema = gitSchema.extend({ autoDeploy: z.boolean(), healthCheckPath, startTimeout }).refine(hasPortForHealthCheck, healthCheckPortIssue)

export const databaseSettingsSchema = serviceSchema.pick({ name: true })

export const instancesSchema = z.object({
  instances: z.int('Enter a whole number').min(1, 'Use 1 to 10 instances').max(10, 'Use 1 to 10 instances')
})

export const logsQuerySchema = z.object({
  instance: z.string().max(253).optional()
})
