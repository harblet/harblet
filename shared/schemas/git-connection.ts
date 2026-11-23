import { z } from 'zod'

export const gitConnectionParamsSchema = z.object({
  id: z.uuidv7('Invalid connection ID')
})

export const githubConnectionSchema = z.object({
  organization: z.string({ error: 'Enter an organization' })
    .trim()
    .max(39, 'Use at most 39 characters')
    .regex(/^([a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)?$/, 'Enter the organization as it appears in its GitHub URL')
    .nullish()
})

export const githubCallbackSchema = z.object({
  code: z.string().regex(/^[\w-]+$/),
  state: z.string().min(1)
})

export const githubPushSchema = z.object({
  ref: z.string(),
  deleted: z.boolean(),
  repository: z.object({ html_url: z.string() })
})

const gitlabUrlMessage = 'Enter an https:// URL without a path, like https://gitlab.com'

export const gitlabConnectionSchema = z.object({
  url: z.string({ error: gitlabUrlMessage })
    .trim()
    .refine(value => /^https:\/\/[^\s/@?#]+\/?$/.test(value) && URL.canParse(value), gitlabUrlMessage)
    .transform(value => new URL(value).origin),
  token: z.string({ error: 'Enter an access token' })
    .trim()
    .min(1, 'Enter an access token')
    .max(255, 'Use at most 255 characters')
})

export const gitlabTokenSchema = gitlabConnectionSchema.pick({ token: true })
