import { z } from 'zod'

const schema = z.object({
  databaseUrl: z.string().min(1),
  appSecret: z.string().min(32),
  public: z.object({ siteUrl: z.url() })
})

export default defineNitroPlugin(() => {
  const { error } = schema.safeParse(useRuntimeConfig())
  if (error) {
    const issues = error.issues.map(issue => `NUXT_${issue.path.join('_').replace(/[A-Z]/g, '_$&').toUpperCase()}: ${issue.message}`)
    throw new Error(`Invalid configuration:\n${issues.join('\n')}`)
  }
})
