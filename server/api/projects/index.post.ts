import { projectSchema } from '#shared/schemas/project'
import { projects } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, projectSchema.safeParse)
  if (!result.success) {
    throw validationError(result.error)
  }
  const body = result.data

  try {
    const project = await db.transaction(async (tx) => {
      const [project] = await tx.insert(projects).values({ ...body, namespace: kubeName(body.name, 'project') }).returning()

      await kubeApply({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: project!.namespace, labels: { 'app.kubernetes.io/managed-by': 'harblet' } }
      })

      await kubeApply({
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: { name: 'harblet', namespace: project!.namespace },
        spec: {
          podSelector: {},
          policyTypes: ['Ingress'],
          ingress: [
            { from: [{ podSelector: {} }] },
            {
              from: [{
                namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } },
                podSelector: { matchLabels: { 'app.kubernetes.io/name': 'traefik' } }
              }]
            }
          ]
        }
      })

      return project!
    })
    setResponseStatus(event, 201)
    return project
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError({ statusCode: 409, message: 'A project with this name already exists.' })
    }
    throw error
  }
})
