export default defineEventHandler(async () => {
  const connections = await db.query.gitConnections.findMany({
    orderBy: { id: 'asc' },
    with: { services: { columns: { id: true } } }
  })
  return Promise.all(connections.map(async (connection) => {
    const base = {
      id: connection.id,
      name: connection.name,
      owner: connection.owner,
      serviceCount: connection.services.length
    }
    if (connection.provider === 'gitlab') {
      const { url } = gitlabConfig(connection)
      const token = await findGitlabToken(url, connection.credentials).catch((error: Error & { status?: number }) => error)
      const rejected = token instanceof Error && token.status === 401
      return {
        ...base,
        provider: 'gitlab' as const,
        url,
        token: token instanceof Error ? rejected ? null : undefined : { expiresAt: token.expiresAt },
        error: token instanceof Error && !rejected ? token.message : undefined
      }
    }
    const { slug, ownerType } = githubConfig(connection)
    const installation = await findInstallation(connection).catch((error: Error) => error)
    return {
      ...base,
      provider: 'github' as const,
      appUrl: ownerType === 'Organization'
        ? `https://github.com/organizations/${connection.owner}/settings/apps/${slug}`
        : `https://github.com/settings/apps/${slug}`,
      installUrl: `https://github.com/apps/${slug}/installations/new`,
      installation: installation instanceof Error ? undefined : installation ?? null,
      error: installation instanceof Error ? installation.message : undefined
    }
  }))
})
