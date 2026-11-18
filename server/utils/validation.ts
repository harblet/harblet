import type { z } from 'zod'

export function validationError(error: z.ZodError) {
  const errors = error.issues.map((issue) => ({ name: issue.path.join('.'), message: issue.message }))
  return createError({ statusCode: 400, statusMessage: 'Validation Error', message: errors[0]?.message, data: { errors } })
}
