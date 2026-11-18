import { pipeline } from 'node:stream'
import type { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { eq } from 'drizzle-orm'
import { backupSchedules } from '#shared/schemas/backup'
import type { BackupSchedule } from '#shared/schemas/backup'
import { isDatabase } from '#shared/schemas/service'
import { backups, restores, services, settings } from '../database/schema'
import type { backupDestinations } from '../database/schema'

const logger = useLogger('backups')

const heartbeat = 'while kill -0 $$ 2>/dev/null; do echo; sleep 1; done &'

const dumps = {
  postgres: {
    command: 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom',
    restore: [
      heartbeat,
      'set -e',
      'export PGOPTIONS="-c client_min_messages=warning"',
      'run() { psql -U "$POSTGRES_USER" -d template1 -q -v ON_ERROR_STOP=1 "$@"; }',
      'trap \'run -c "DROP DATABASE IF EXISTS harblet_restore WITH (FORCE)"\' EXIT',
      'run -c "DROP DATABASE IF EXISTS harblet_restore WITH (FORCE)" -c "CREATE DATABASE harblet_restore"',
      'pg_restore -U "$POSTGRES_USER" -d harblet_restore --exit-on-error',
      'trap - EXIT',
      'run -c "DROP DATABASE \\"$POSTGRES_DB\\" WITH (FORCE)" -c "ALTER DATABASE harblet_restore RENAME TO \\"$POSTGRES_DB\\""'
    ].join('\n'),
    extension: 'dump',
    gzip: false
  },
  mysql: {
    command: 'export MYSQL_PWD="${MYSQL_PASSWORD:-$MYSQL_ROOT_PASSWORD}"; exec mysqldump -u"${MYSQL_USER:-root}" --single-transaction --routines --triggers --events --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"',
    restore: [
      heartbeat,
      'set -e',
      'export MYSQL_PWD="${MYSQL_PASSWORD:-$MYSQL_ROOT_PASSWORD}"',
      'mysql -u"${MYSQL_USER:-root}" -e "DROP DATABASE IF EXISTS \\`$MYSQL_DATABASE\\`; CREATE DATABASE \\`$MYSQL_DATABASE\\`"',
      'exec mysql -u"${MYSQL_USER:-root}" "$MYSQL_DATABASE"'
    ].join('\n'),
    extension: 'sql.gz',
    gzip: true
  }
}

type StoredBackup = Pick<typeof backups.$inferSelect, 'id' | 'status' | 'key'> & { destination: typeof backupDestinations.$inferSelect }

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function lockIdle(tx: Transaction, serviceId: string | null) {
  if (serviceId) {
    await tx.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).for('update')
  } else {
    await tx.select({ id: settings.id }).from(settings).for('update')
  }
  if (await tx.query.backups.findFirst({ where: { serviceId: serviceId ?? { isNull: true }, status: 'running' }, columns: { id: true } })) {
    throw createError({ statusCode: 409, message: 'A backup is running. Wait for it to finish.' })
  }
  if (serviceId && await tx.query.restores.findFirst({ where: { serviceId, status: 'running' }, columns: { id: true } })) {
    throw createError({ statusCode: 409, message: 'A restore is running. Wait for it to finish.' })
  }
}

async function findDatabase(database: Pick<typeof db, 'query'>, serviceId: string | null) {
  if (!serviceId) {
    const system = await database.query.settings.findFirst({ with: { backupDestination: true } })
    return {
      namespace: systemNamespace,
      hostname: 'postgres',
      type: 'postgres' as const,
      destination: system?.backupDestination,
      retention: system?.backupRetention ?? 7
    }
  }
  const service = await database.query.services.findFirst({
    where: { id: serviceId },
    columns: { hostname: true, type: true, backupRetention: true },
    with: { project: { columns: { namespace: true } }, backupDestination: true }
  })
  if (!service || !isDatabase(service.type)) {
    throw createError({ statusCode: 404, message: 'Database not found.' })
  }
  return {
    namespace: service.project.namespace,
    hostname: service.hostname,
    type: service.type,
    destination: service.backupDestination,
    retention: service.backupRetention
  }
}

export function createBackup(serviceId: string | null, trigger: 'user' | 'schedule', userId: string | null) {
  return db.transaction(async (tx) => {
    await lockIdle(tx, serviceId)
    const database = await findDatabase(tx, serviceId)
    if (!database.destination) {
      throw createError({ statusCode: 409, message: 'Choose a destination before backing up.' })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const [backup] = await tx.insert(backups).values({
      serviceId,
      destinationId: database.destination.id,
      userId,
      trigger,
      key: destinationKey(database.destination, `${database.namespace}/${database.hostname}/${timestamp}.${dumps[database.type].extension}`)
    }).returning()
    return backup!
  })
}

export async function runBackup(id: string) {
  const backup = await db.query.backups.findFirst({ where: { id }, with: { destination: true } })
  if (!backup) {
    return
  }
  const { destination } = backup
  const database = await findDatabase(db, backup.serviceId)
  const dump = dumps[database.type]
  const client = s3Client(destination)
  let stdout: Readable | undefined

  try {
    stdout = await kubeExec(database.namespace, `${database.hostname}-0`, database.hostname, ['sh', '-c', dump.command])
    const upload = new Upload({
      client,
      params: { Bucket: destination.config.bucket, Key: backup.key, Body: dump.gzip ? pipeline(stdout, createGzip(), () => {}) : stdout },
      partSize: 16 * 1024 * 1024,
      queueSize: 2
    })
    let size = 0
    upload.on('httpUploadProgress', ({ loaded }) => {
      size = loaded ?? size
    })
    await upload.done()
    await db.update(backups).set({ status: 'succeeded', size, finishedAt: new Date() }).where(eq(backups.id, id))
  } catch (error) {
    logger.error(error)
    const message = error instanceof KubeError && error.statusCode === 404 ? 'The database isn\'t running.' : (error as Error).message
    await db.update(backups).set({ status: 'failed', error: message, finishedAt: new Date() }).where(eq(backups.id, id))
    return
  } finally {
    stdout?.destroy()
    client.destroy()
  }

  if (backup.trigger === 'schedule') {
    await pruneBackups(backup.serviceId, database.retention).catch(error => logger.error(error))
  }
}

export function createRestore(backupId: string, userId: string) {
  return db.transaction(async (tx) => {
    const backup = await tx.query.backups.findFirst({ where: { id: backupId, status: 'succeeded' }, columns: { serviceId: true } })
    if (!backup?.serviceId) {
      throw createError({ statusCode: 404, message: 'Backup not found.' })
    }
    await lockIdle(tx, backup.serviceId)
    const [restore] = await tx.insert(restores).values({ serviceId: backup.serviceId, backupId, userId }).returning()
    return restore!
  })
}

export async function runRestore(id: string) {
  const restore = await db.query.restores.findFirst({
    where: { id },
    with: {
      backup: { with: { destination: true } },
      service: { columns: { hostname: true, type: true }, with: { project: { columns: { namespace: true } } } }
    }
  })
  if (!restore?.backup) {
    return
  }
  const { backup, service } = restore
  const dump = dumps[service.type as keyof typeof dumps]
  const client = s3Client(backup.destination)
  let output: Readable | undefined

  try {
    const object = await client.send(new GetObjectCommand({ Bucket: backup.destination.config.bucket, Key: backup.key }))
    const body = object.Body as Readable
    output = await kubeExec(service.project.namespace, `${service.hostname}-0`, service.hostname, ['sh', '-c', dump.restore], dump.gzip ? pipeline(body, createGunzip(), () => {}) : body)
    await finished(output.resume())
    await db.update(restores).set({ status: 'succeeded', finishedAt: new Date() }).where(eq(restores.id, id))
  } catch (error) {
    logger.error(error)
    const message = error instanceof KubeError && error.statusCode === 404 ? 'The database isn\'t running.' : (error as Error).message
    await db.update(restores).set({ status: 'failed', error: message, finishedAt: new Date() }).where(eq(restores.id, id))
  } finally {
    output?.destroy()
    client.destroy()
  }
}

export async function deleteBackup(backup: StoredBackup) {
  if (backup.status === 'succeeded') {
    const client = s3Client(backup.destination)
    try {
      await client.send(new DeleteObjectCommand({ Bucket: backup.destination.config.bucket, Key: backup.key }))
    } finally {
      client.destroy()
    }
  }
  await db.delete(backups).where(eq(backups.id, backup.id))
}

async function pruneBackups(serviceId: string | null, retention: number) {
  const scheduled = await db.query.backups.findMany({
    where: { serviceId: serviceId ?? { isNull: true }, trigger: 'schedule', status: { ne: 'running' } },
    orderBy: { id: 'desc' },
    with: { destination: true }
  })
  let kept = 0
  for (const backup of scheduled) {
    if (kept >= retention) {
      await deleteBackup(backup)
    } else if (backup.status === 'succeeded') {
      kept++
    }
  }
}

let checking = false

async function runDueBackups() {
  if (checking) {
    return
  }
  checking = true
  try {
    const scheduled: { id: string | null, backupSchedule: BackupSchedule }[] = await db.query.services.findMany({
      where: { backupSchedule: { ne: 'off' }, backupDestinationId: { isNotNull: true } },
      columns: { id: true, backupSchedule: true }
    })
    const system = await db.query.settings.findFirst({
      where: { backupSchedule: { ne: 'off' }, backupDestinationId: { isNotNull: true } },
      columns: { backupSchedule: true }
    })
    if (system) {
      scheduled.unshift({ id: null, backupSchedule: system.backupSchedule })
    }
    for (const service of scheduled) {
      const { interval } = backupSchedules[service.backupSchedule]
      const slot = new Date(Math.floor(Date.now() / interval) * interval)
      if (await db.query.backups.findFirst({ where: { serviceId: service.id ?? { isNull: true }, trigger: 'schedule', createdAt: { gte: slot } }, columns: { id: true } })) {
        continue
      }
      const backup = await createBackup(service.id, 'schedule', null).catch((error) => {
        if (error.statusCode !== 409) {
          logger.error(error)
        }
      })
      if (backup) {
        await runBackup(backup.id)
      }
    }
  } finally {
    checking = false
  }
}

async function settleInterruptedBackup(backup: StoredBackup) {
  const client = s3Client(backup.destination)
  try {
    const object = await client.send(
      new HeadObjectCommand({ Bucket: backup.destination.config.bucket, Key: backup.key }),
      { abortSignal: AbortSignal.timeout(15_000) }
    )
    await db.update(backups)
      .set({ status: 'succeeded', size: object.ContentLength, finishedAt: object.LastModified ?? new Date() })
      .where(eq(backups.id, backup.id))
  } catch {
    await db.update(backups)
      .set({ status: 'failed', error: 'Harblet restarted during the backup.', finishedAt: new Date() })
      .where(eq(backups.id, backup.id))
  } finally {
    client.destroy()
  }
}

export async function scheduleBackups() {
  const interrupted = await db.query.backups.findMany({ where: { status: 'running' }, with: { destination: true } })
  await Promise.all(interrupted.map(settleInterruptedBackup))
  await db.update(restores)
    .set({ status: 'failed', error: 'Harblet restarted during the restore.', finishedAt: new Date() })
    .where(eq(restores.status, 'running'))
  setInterval(() => runDueBackups().catch(error => logger.error(error)), 60_000)
}
