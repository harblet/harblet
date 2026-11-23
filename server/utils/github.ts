import { sign } from 'node:crypto'
import { createClient, RepoError } from 'repo-sdk'
import { github } from 'repo-sdk/github'
import type { gitConnections } from '../database/schema'

type GitConnection = typeof gitConnections.$inferSelect

export function githubConfig(connection: Pick<GitConnection, 'config'>) {
  return connection.config as Extract<GitConnection['config'], { appId: number }>
}

const repositoryUrl = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/

async function githubFetch<T>(path: string, token?: string, method?: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'accept': 'application/vnd.github+json',
      'user-agent': 'Harblet',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string }
    throw Object.assign(new Error(`GitHub: ${data.message ?? response.statusText}`), { status: response.status })
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

function appToken(connection: GitConnection) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const payload = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 9 * 60, iss: String(githubConfig(connection).appId) })}`
  return `${payload}.${sign('sha256', Buffer.from(payload), connection.credentials).toString('base64url')}`
}

export async function convertManifest(code: string): Promise<typeof gitConnections.$inferInsert> {
  const app = await githubFetch<{
    id: number
    slug: string
    name: string
    owner: { login: string, type: 'User' | 'Organization' }
    pem: string
    webhook_secret: string | null
  }>(`/app-manifests/${encodeURIComponent(code)}/conversions`, undefined, 'POST')
  return {
    provider: 'github',
    name: app.name,
    owner: app.owner.login,
    config: { appId: app.id, slug: app.slug, ownerType: app.owner.type },
    credentials: app.pem,
    webhookSecret: app.webhook_secret
  }
}

export async function findInstallation(connection: GitConnection) {
  const [installation] = await githubFetch<{
    id: number
    html_url: string
    repository_selection: 'all' | 'selected'
    suspended_at: string | null
  }[]>('/app/installations', appToken(connection))
  return installation && {
    id: installation.id,
    url: installation.html_url,
    repositorySelection: installation.repository_selection,
    suspended: !!installation.suspended_at
  }
}

export async function uninstallApp(connection: GitConnection) {
  try {
    const installation = await findInstallation(connection)
    if (installation) {
      await githubFetch(`/app/installations/${installation.id}`, appToken(connection), 'DELETE')
    }
  } catch (error) {
    if ((error as { status?: number }).status !== 404) {
      throw error
    }
  }
}

export async function listGithubRepositories(connection: GitConnection) {
  const installation = await findInstallation(connection)
  if (!installation) {
    return []
  }
  const client = createClient({
    provider: github({ auth: { appId: githubConfig(connection).appId, privateKey: connection.credentials, installationId: installation.id } })
  })
  const repositories = []
  for await (const repository of client.repos.listAll()) {
    repositories.push({
      fullName: repository.path,
      url: repository.urls.web,
      defaultBranch: repository.defaultBranch,
      private: repository.private
    })
  }
  return repositories
}

export async function githubCloneCredentials(connection: GitConnection, repository: string) {
  const [, owner, name] = repository.match(repositoryUrl) ?? []
  if (!owner || !name) {
    throw new Error(`${repository} isn't a GitHub repository URL.`)
  }
  const client = createClient({
    provider: github({ auth: { appId: githubConfig(connection).appId, privateKey: connection.credentials, owner, repositories: [name] } })
  })
  const { username, password } = await client.repos.getCloneCredentials({ repo: `${owner}/${name}` }).catch((error) => {
    if (error instanceof RepoError && (error.code === 'not_found' || error.status === 422)) {
      throw new Error(`The GitHub App ${connection.name} can't access ${owner}/${name}. Choose its repositories on GitHub.`)
    }
    throw error
  })
  return { username: username!, password: password! }
}
