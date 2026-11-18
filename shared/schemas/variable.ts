import { z } from 'zod'

export const variablesSchema = z.object({
  variables: z.array(z.object({
    key: z.string({ error: 'Enter a key' })
      .trim()
      .min(1, 'Enter a key')
      .max(253, 'Use at most 253 characters')
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, digits and underscores, and don\'t start with a digit'),
    value: z.string({ error: 'Enter a value' }).min(1, 'Enter a value').max(32768, 'Use at most 32,768 characters')
  })).superRefine((variables, ctx) => {
    const counts = new Map<string, number>()
    variables.forEach(({ key }) => counts.set(key, (counts.get(key) ?? 0) + 1))
    variables.forEach(({ key }, index) => {
      if (counts.get(key)! > 1) {
        ctx.addIssue({ code: 'custom', message: 'This key is already used', path: [index, 'key'] })
      }
    })
  })
})
