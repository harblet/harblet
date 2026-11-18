export default defineEventHandler(async () => {
  const [project, services, deployments] = await Promise.all([
    db.query.projects.findFirst({ columns: { id: true } }),
    db.query.services.findMany({
      columns: { id: true, name: true },
      with: {
        project: { columns: { id: true, name: true } },
        deployments: {
          columns: { id: true, status: true, error: true, finishedAt: true },
          orderBy: { id: 'desc' },
          limit: 1
        }
      }
    }),
    db.query.deployments.findMany({
      columns: { id: true, trigger: true, status: true, commitSha: true, commitMessage: true, image: true, createdAt: true },
      orderBy: { id: 'desc' },
      limit: 10,
      with: {
        user: { columns: { id: true, name: true, image: true } },
        service: {
          columns: { id: true, name: true },
          with: { project: { columns: { id: true, name: true } } }
        }
      }
    })
  ])

  return {
    hasProjects: !!project,
    failed: services
      .flatMap(({ deployments, ...service }) => deployments[0]?.status === 'failed' ? [{ ...service, deployment: deployments[0] }] : [])
      .sort((a, b) => b.deployment.id.localeCompare(a.deployment.id)),
    deployments
  }
})
