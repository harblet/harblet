import { existsSync } from 'node:fs'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { join } from 'node:path'

export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) {
    return
  }
  const migrationsFolder = join(process.cwd(), 'server/database/migrations')
  if (!existsSync(migrationsFolder)) {
    return
  }
  const logger = useLogger('plugins:migrations')
  logger.info('Running database migrations')
  const migrated = migrate(db, { migrationsFolder })
    .then(() => logger.info('Database migrations completed'))
    .then(resumeDeployments)
    .then(scheduleBackups)
    .then(scheduleMetrics)
  nitroApp.hooks.hook('request', async () => {
    await migrated
  })
})
