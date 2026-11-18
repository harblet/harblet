import { createClient, RepoError } from 'repo-sdk'
import { gitlab } from 'repo-sdk/gitlab'
import type { gitConnections } from '../database/schema'

type GitConnection = typeof gitConnections.$inferSelect

export function gitlabConfig(connection: Pick<GitConnection, 'config'>) {
  return connection.config as Extract<GitConnection['config'], { url: string }>
}

async function gitlabFetch<T>(url: string, token: string, path: string) {
  const response = await fetch(`${url}/api/v4${path}`, { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string, error_description?: string }
    throw Object.assign(new Error(`GitLab: ${data.error_description ?? data.message ?? response.statusText}`), { status: response.status })
  }
  return await response.json() as T
}

function gitlabClient(connection: GitConnection) {
  return createClient({
    provider: gitlab({ auth: { token: connection.credentials }, baseUrl: `${gitlabConfig(connection).url}/api/v4` })
  })
}

function tokenError(message: string) {
  return createError({ statusCode: 400, message, data: { errors: [{ name: 'token', message }] } })
}

function explained(connection: GitConnection, error: unknown) {
  return error instanceof RepoError && error.code === 'unauthorized'
    ? new Error(`GitLab rejected the access token ${connection.name}. It expired or was revoked, so an admin has to replace it in Settings → Git.`)
    : error
}

export async function findGitlabToken(url: string, token: string) {
  const { name, scopes, expires_at: expiresAt } = await gitlabFetch<{ name: string, scopes: string[], expires_at: string | null }>(url, token, '/personal_access_tokens/self')
  return { name, scopes, expiresAt }
}

export async function inspectGitlabToken(url: string, token: string) {
  const { name, scopes } = await findGitlabToken(url, token).catch((error: { status?: number }) => {
    if (error.status && [400, 401, 403].includes(error.status)) {
      throw tokenError('GitLab doesn\'t accept this token. Check that you copied all of it and that it hasn\'t expired.')
    }
    const message = `Harblet can't reach GitLab at ${url}.`
    throw createError({ statusCode: 502, message, data: { errors: [{ name: 'url', message }] } })
  })
  if (!scopes.includes('read_repository') || !scopes.some(scope => scope === 'read_api' || scope === 'api')) {
    throw tokenError('The token needs the scopes read_api and read_repository.')
  }
  const { username } = await gitlabFetch<{ username: string }>(url, token, '/user')
  const [, kind, id] = username.match(/^(group|project)_(\d+)_bot/) ?? []
  const namespace = kind
    ? await gitlabFetch<{ full_path?: string, path_with_namespace?: string }>(url, token, `/${kind}s/${id}`).catch(() => undefined)
    : undefined
  return { name, owner: namespace?.full_path ?? namespace?.path_with_namespace ?? username }
}

export async function listGitlabRepositories(connection: GitConnection) {
  const repositories = []
  try {
    for await (const repository of gitlabClient(connection).repos.listAll()) {
      repositories.push({
        fullName: repository.path,
        url: repository.urls.web,
        defaultBranch: repository.defaultBranch,
        private: repository.private
      })
    }
  } catch (error) {
    throw explained(connection, error)
  }
  return repositories
}

export async function gitlabCloneCredentials(connection: GitConnection, repository: string) {
  const { url } = gitlabConfig(connection)
  const target = new URL(repository)
  const [, path] = target.pathname.match(/^\/(.+?)(?:\.git)?\/?$/) ?? []
  if (target.origin !== url || !path) {
    throw new Error(`${repository} isn't a repository on ${url}.`)
  }
  await gitlabClient(connection).repos.get({ repo: path }).catch((error) => {
    if (error instanceof RepoError && error.code === 'not_found') {
      throw new Error(`The GitLab access token ${connection.name} can't access ${path}. It needs at least the Reporter role there.`)
    }
    throw explained(connection, error)
  })
  return { username: 'oauth2', password: connection.credentials }
}
