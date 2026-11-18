export default defineEventHandler(async () => {
  const connections = await db.query.gitConnections.findMany({ orderBy: { id: 'asc' } })
  return Promise.all(connections.map(async (connection) => {
    const repositories = await listRepositories(connection).catch((error: Error) => error)
    return {
      id: connection.id,
      provider: connection.provider,
      owner: connection.owner,
      repositories: repositories instanceof Error ? [] : repositories.toSorted((a, b) => a.fullName.localeCompare(b.fullName)),
      error: repositories instanceof Error ? repositories.message : undefined
    }
  }))
})
