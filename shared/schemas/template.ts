import { z } from 'zod'
import { domainSchema } from './domain'

export const templateInstallationSchema = z.object({
  template: z.string({ error: 'Choose a template' }),
  domain: z.literal('').or(domainSchema.shape.hostname).nullish()
})
