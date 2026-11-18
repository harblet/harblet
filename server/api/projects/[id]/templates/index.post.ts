import { projectParamsSchema } from '#shared/schemas/project'
import { templateInstallationSchema } from '#shared/schemas/template'
import { templateNeedsDomain, templates } from '#shared/templates'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const params = await getValidatedRouterParams(event, projectParamsSchema.safeParse)
  if (!params.success) {
    throw validationError(params.error)
  }
  const result = await readValidatedBody(event, templateInstallationSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }

  const template = templates.find(template => template.id === result.data.template)
  if (!template) {
    throw createError({ statusCode: 404, message: 'Template not found.' })
  }
  const domain = (template.domain && result.data.domain) || null
  if (!domain && templateNeedsDomain(template)) {
    const message = 'Enter a domain'
    throw createError({ statusCode: 400, message, data: { errors: [{ name: 'domain', message }] } })
  }

  const project = await db.query.projects.findFirst({ where: { id: params.data.id }, columns: { id: true } })
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found.' })
  }
  if (domain) {
    await checkDomain(domain, user.role === 'admin', 'domain')
  }

  try {
    await installTemplate(project.id, template, domain, user.id)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw domainTaken('domain')
    }
    throw error
  }

  setResponseStatus(event, 204)
})
