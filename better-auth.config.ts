import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { betterAuth } from 'better-auth'
import { admin, bearer, deviceAuthorization } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

export const auth = betterAuth({
  baseURL: process.env.NUXT_PUBLIC_SITE_URL,
  database: drizzleAdapter(drizzle(process.env.NUXT_DATABASE_URL!), { provider: 'pg', usePlural: true }),
  advanced: { database: { validateSchema: false, generateId: () => uuidv7() } },
  emailAndPassword: { enabled: true },
  plugins: [admin(), bearer(), deviceAuthorization()],
})
