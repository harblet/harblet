import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { databaseEngines, databaseUrl, isDatabase } from '#shared/schemas/service'
import type { Template } from '#shared/types/template'
import { domains, environmentVariables, projects, services, volumes } from '../database/schema'

type ServiceValues = typeof services.$inferInsert

function serviceProperties(values: ServiceValues): Record<string, string | undefined> {
  return isDatabase(values.type)
    ? {
        hostname: values.hostname,
        port: String(databaseEngines[values.type].port),
        url: databaseUrl(values.type, values, values.databasePassword!),
        user: values.databaseUser!,
        password: values.databasePassword!,
        database: values.databaseName!
      }
    : { hostname: values.hostname, port: values.port ? String(values.port) : undefined }
}

function generateSecret() {
  return randomBytes(32).toString('hex')
}

function resolvePlaceholders(value: string, values: Record<string, ServiceValues>, domain: string | null, secrets: Record<string, string>) {
  return value.replace(/\$\{(\w+)(?:\.(\w+))?\}/g, (placeholder, key: string, property?: string) => {
    const resolved = key === 'secret'
      ? property ? secrets[property] ??= generateSecret() : generateSecret()
      : property
        ? values[key] && serviceProperties(values[key])[property]
        : key === 'domain' ? domain : undefined
    if (!resolved) {
      throw new Error(`The template uses ${placeholder}, which has no value.`)
    }
    return resolved
  })
}

export async function installTemplate(projectId: string, template: Template, domain: string | null, userId: string) {
  const entries = Object.entries(template.services)
  const values = Object.fromEntries(entries.map(([key, service]) => [key, serviceValues(projectId, service)]))
  const secrets: Record<string, string> = {}

  await db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for('update')
    let deploymentId: string | undefined
    for (const [key, service] of entries) {
      const [created] = await tx.insert(services)
        .values(service.type === 'image' ? { ...values[key]!, command: service.command, healthCheckPath: service.healthCheckPath, startTimeout: service.startTimeout } : values[key]!)
        .returning({ id: services.id })
      const { id } = created!
      if (service.type === 'image') {
        const variables = Object.entries(service.variables ?? {})
        if (variables.length) {
          await tx.insert(environmentVariables).values(variables.map(([name, value]) => ({ serviceId: id, key: name, value: resolvePlaceholders(value, values, domain, secrets) })))
        }
        if (service.volumes?.length) {
          await tx.insert(volumes).values(service.volumes.map(mountPath => ({ serviceId: id, mountPath })))
        }
      }
      if (domain && key === template.domain) {
        await tx.insert(domains).values({ serviceId: id, hostname: domain })
      }
      deploymentId = await queueDeployment(tx, id, userId, undefined, deploymentId)
    }
    if (domain) {
      await syncDomains(tx, projectId)
    }
  })
  await startQueuedDeployments()
}
