import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { authRelations } from '../database/auth-schema'
import * as schema from '../database/schema'
import { appRelations } from '../database/schema'

export const db = drizzle(useRuntimeConfig().databaseUrl, {
  relations: { ...defineRelations(schema), ...authRelations, ...appRelations }
})

export function isUniqueViolation(error: unknown) {
  return (error as { cause?: { code?: string } } | undefined)?.cause?.code === '23505'
}
