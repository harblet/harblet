import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { defineServerAuth } from '@nuxtjs/better-auth/config'
import { admin, bearer, deviceAuthorization } from 'better-auth/plugins'
import { v7 as uuidv7 } from 'uuid'
import * as schema from './database/schema'
import { db } from './utils/db'

export default defineServerAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true, transaction: true }),
  advanced: { database: { generateId: () => uuidv7() } },
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [admin(), bearer(), deviceAuthorization({ validateClient: clientId => clientId === 'harblet-cli' })]
})
