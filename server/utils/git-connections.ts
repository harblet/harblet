import type { gitConnections } from '../database/schema'

type GitConnection = typeof gitConnections.$inferSelect

export function listRepositories(connection: GitConnection) {
  return connection.provider === 'gitlab' ? listGitlabRepositories(connection) : listGithubRepositories(connection)
}

export function cloneCredentials(connection: GitConnection, repository: string) {
  return connection.provider === 'gitlab' ? gitlabCloneCredentials(connection, repository) : githubCloneCredentials(connection, repository)
}
