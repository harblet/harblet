import { randomBytes } from 'node:crypto'
import { databaseEngines } from '#shared/schemas/service'
import type { services } from '../database/schema'

export function generatePassword() {
  return randomBytes(24).toString('base64url')
}

export function databaseContainer(service: typeof services.$inferSelect) {
  const user = service.databaseUser!
  const password = service.databasePassword!
  const database = service.databaseName!

  switch (service.type) {
    case 'postgres':
      return {
        port: databaseEngines.postgres.port,
        env: { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: database },
        mountPath: '/var/lib/postgresql',
        probe: ['sh', '-c', 'pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
      }
    case 'mysql':
      return {
        port: databaseEngines.mysql.port,
        env: user === 'root'
          ? { MYSQL_ROOT_PASSWORD: password, MYSQL_DATABASE: database }
          : { MYSQL_ROOT_PASSWORD: generatePassword(), MYSQL_USER: user, MYSQL_PASSWORD: password, MYSQL_DATABASE: database },
        mountPath: '/var/lib/mysql',
        probe: ['mysqladmin', 'ping', '-h', '127.0.0.1']
      }
  }
}
