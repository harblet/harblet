import { randomUUID } from 'node:crypto'
import { defineRelationsPart } from 'drizzle-orm'
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, unique } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { v7 as uuidv7 } from 'uuid'
import { users } from './auth-schema'
import { encrypted } from './encrypted'

export * from './auth-schema'

const id = () => text('id').primaryKey().$defaultFn(() => uuidv7())

const timestamps = {
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull()
}

export const serviceType = pgEnum('service_type', ['image', 'git', 'postgres', 'mysql'])

export const gitProvider = pgEnum('git_provider', ['github', 'gitlab'])

export const deploymentStatus = pgEnum('deployment_status', ['queued', 'building', 'deploying', 'succeeded', 'failed', 'cancelled'])

export const deploymentTrigger = pgEnum('deployment_trigger', ['user', 'hook', 'push', 'rollback'])

export const backupProvider = pgEnum('backup_provider', ['s3'])

export const backupSchedule = pgEnum('backup_schedule', ['off', 'every_15_minutes', 'hourly', 'daily'])

export const backupStatus = pgEnum('backup_status', ['running', 'succeeded', 'failed'])

export const backupTrigger = pgEnum('backup_trigger', ['user', 'schedule'])

export const invitations = pgTable('invitations', {
  id: id(),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  role: text('role').$type<'admin' | 'user'>().default('user').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ...timestamps
})

export const projects = pgTable('projects', {
  id: id(),
  name: text('name').notNull().unique(),
  namespace: text('namespace').notNull().unique(),
  ...timestamps
})

export const gitConnections = pgTable('git_connections', {
  id: id(),
  provider: gitProvider('provider').notNull(),
  name: text('name').notNull(),
  owner: text('owner').notNull(),
  config: jsonb('config').$type<{ appId: number, slug: string, ownerType: 'User' | 'Organization' } | { url: string }>().notNull(),
  credentials: encrypted('credentials').notNull(),
  webhookSecret: encrypted('webhook_secret'),
  ...timestamps
})

export const backupDestinations = pgTable('backup_destinations', {
  id: id(),
  provider: backupProvider('provider').notNull(),
  name: text('name').notNull().unique(),
  config: jsonb('config').$type<{ endpoint: string | null, region: string, bucket: string, prefix: string | null, accessKeyId: string }>().notNull(),
  credentials: encrypted('credentials').notNull(),
  ...timestamps
})

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  backupDestinationId: text('backup_destination_id').references(() => backupDestinations.id, { onDelete: 'set null' }),
  backupSchedule: backupSchedule('backup_schedule').default('off').notNull(),
  backupRetention: integer('backup_retention').default(7).notNull()
})

export const services = pgTable('services', {
  id: id(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hostname: text('hostname').notNull(),
  type: serviceType('type').notNull(),
  image: text('image'),
  repository: text('repository'),
  gitConnectionId: text('git_connection_id').references(() => gitConnections.id, { onDelete: 'set null' }),
  branch: text('branch'),
  autoDeploy: boolean('auto_deploy').default(true).notNull(),
  rootDirectory: text('root_directory'),
  dockerfilePath: text('dockerfile_path'),
  port: integer('port'),
  healthCheckPath: text('health_check_path'),
  startTimeout: integer('start_timeout').default(5).notNull(),
  command: text('command'),
  instances: integer('instances').default(1).notNull(),
  databaseName: text('database_name'),
  databaseUser: text('database_user'),
  databasePassword: encrypted('database_password'),
  backupDestinationId: text('backup_destination_id').references(() => backupDestinations.id, { onDelete: 'set null' }),
  backupSchedule: backupSchedule('backup_schedule').default('off').notNull(),
  backupRetention: integer('backup_retention').default(7).notNull(),
  deployHookToken: text('deploy_hook_token').notNull().unique().$defaultFn(() => randomUUID()),
  ...timestamps
}, table => [unique().on(table.projectId, table.hostname)])

export const deployments = pgTable('deployments', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  afterDeploymentId: text('after_deployment_id').references((): AnyPgColumn => deployments.id, { onDelete: 'set null' }),
  trigger: deploymentTrigger('trigger').notNull(),
  status: deploymentStatus('status').default('queued').notNull(),
  commitSha: text('commit_sha'),
  commitMessage: text('commit_message'),
  image: text('image'),
  imageDigest: text('image_digest'),
  port: integer('port'),
  healthCheckPath: text('health_check_path'),
  command: text('command'),
  logs: text('logs'),
  buildLogs: text('build_logs'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  ...timestamps
}, table => [index('deployments_service_id_idx').on(table.serviceId)])

export const certificates = pgTable('certificates', {
  id: id(),
  certificate: text('certificate').notNull(),
  privateKey: encrypted('private_key').notNull(),
  hostnames: text('hostnames').array().notNull(),
  issuer: text('issuer').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ...timestamps
})

export const domains = pgTable('domains', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull().unique(),
  ...timestamps
}, table => [index('domains_service_id_idx').on(table.serviceId)])

export const environmentVariables = pgTable('environment_variables', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: encrypted('value').notNull(),
  ...timestamps
}, table => [unique().on(table.serviceId, table.key)])

export const volumes = pgTable('volumes', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  mountPath: text('mount_path').notNull(),
  ...timestamps
}, table => [unique().on(table.serviceId, table.mountPath)])

export const deploymentVariables = pgTable('deployment_variables', {
  id: id(),
  deploymentId: text('deployment_id').notNull().references(() => deployments.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: encrypted('value').notNull(),
  ...timestamps
}, table => [unique().on(table.deploymentId, table.key)])

export const backups = pgTable('backups', {
  id: id(),
  serviceId: text('service_id').references(() => services.id, { onDelete: 'cascade' }),
  destinationId: text('destination_id').notNull().references(() => backupDestinations.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  trigger: backupTrigger('trigger').notNull(),
  status: backupStatus('status').default('running').notNull(),
  key: text('key').notNull(),
  size: bigint('size', { mode: 'number' }),
  error: text('error'),
  finishedAt: timestamp('finished_at'),
  ...timestamps
}, table => [index('backups_service_id_idx').on(table.serviceId)])

export const restores = pgTable('restores', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  backupId: text('backup_id').references(() => backups.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: backupStatus('status').default('running').notNull(),
  error: text('error'),
  finishedAt: timestamp('finished_at'),
  ...timestamps
}, table => [index('restores_service_id_idx').on(table.serviceId)])

export const serverMetrics = pgTable('server_metrics', {
  server: text('server').notNull(),
  time: timestamp('time').notNull(),
  cpu: real('cpu').notNull(),
  cores: real('cores').notNull(),
  memory: bigint('memory', { mode: 'number' }).notNull(),
  disk: bigint('disk', { mode: 'number' }).notNull(),
  diskTotal: bigint('disk_total', { mode: 'number' }).notNull(),
  networkIn: real('network_in'),
  networkOut: real('network_out')
}, table => [primaryKey({ columns: [table.server, table.time] })])

export const serviceMetrics = pgTable('service_metrics', {
  serviceId: text('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  time: timestamp('time').notNull(),
  cpu: real('cpu').notNull(),
  cores: real('cores').notNull(),
  memory: bigint('memory', { mode: 'number' }).notNull(),
  networkIn: real('network_in'),
  networkOut: real('network_out')
}, table => [primaryKey({ columns: [table.serviceId, table.time] })])

export const appRelations = defineRelationsPart(
  { users, invitations, projects, gitConnections, services, deployments, certificates, domains, environmentVariables, volumes, deploymentVariables, backupDestinations, settings, backups, restores },
  r => ({
    invitations: {
      inviter: r.one.users({ from: r.invitations.inviterId, to: r.users.id, optional: false })
    },
    projects: {
      services: r.many.services({ from: r.projects.id, to: r.services.projectId })
    },
    gitConnections: {
      services: r.many.services({ from: r.gitConnections.id, to: r.services.gitConnectionId })
    },
    services: {
      project: r.one.projects({ from: r.services.projectId, to: r.projects.id, optional: false }),
      gitConnection: r.one.gitConnections({ from: r.services.gitConnectionId, to: r.gitConnections.id }),
      backupDestination: r.one.backupDestinations({ from: r.services.backupDestinationId, to: r.backupDestinations.id }),
      backups: r.many.backups({ from: r.services.id, to: r.backups.serviceId }),
      restores: r.many.restores({ from: r.services.id, to: r.restores.serviceId }),
      deployments: r.many.deployments({ from: r.services.id, to: r.deployments.serviceId }),
      domains: r.many.domains({ from: r.services.id, to: r.domains.serviceId }),
      environmentVariables: r.many.environmentVariables({ from: r.services.id, to: r.environmentVariables.serviceId }),
      volumes: r.many.volumes({ from: r.services.id, to: r.volumes.serviceId })
    },
    deployments: {
      service: r.one.services({ from: r.deployments.serviceId, to: r.services.id, optional: false }),
      user: r.one.users({ from: r.deployments.userId, to: r.users.id }),
      environmentVariables: r.many.deploymentVariables({ from: r.deployments.id, to: r.deploymentVariables.deploymentId })
    },
    domains: {
      service: r.one.services({ from: r.domains.serviceId, to: r.services.id, optional: false })
    },
    environmentVariables: {
      service: r.one.services({ from: r.environmentVariables.serviceId, to: r.services.id, optional: false })
    },
    volumes: {
      service: r.one.services({ from: r.volumes.serviceId, to: r.services.id, optional: false })
    },
    deploymentVariables: {
      deployment: r.one.deployments({ from: r.deploymentVariables.deploymentId, to: r.deployments.id, optional: false })
    },
    backupDestinations: {
      services: r.many.services({ from: r.backupDestinations.id, to: r.services.backupDestinationId })
    },
    settings: {
      backupDestination: r.one.backupDestinations({ from: r.settings.backupDestinationId, to: r.backupDestinations.id })
    },
    backups: {
      service: r.one.services({ from: r.backups.serviceId, to: r.services.id }),
      destination: r.one.backupDestinations({ from: r.backups.destinationId, to: r.backupDestinations.id, optional: false }),
      user: r.one.users({ from: r.backups.userId, to: r.users.id })
    },
    restores: {
      service: r.one.services({ from: r.restores.serviceId, to: r.services.id, optional: false }),
      backup: r.one.backups({ from: r.restores.backupId, to: r.backups.id }),
      user: r.one.users({ from: r.restores.userId, to: r.users.id })
    }
  })
)
