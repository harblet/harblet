import type { Template } from '../types/template'
import authentik from './authentik'
import directus from './directus'
import gitlab from './gitlab'
import n8n from './n8n'
import plausible from './plausible'
import umami from './umami'
import uptimeKuma from './uptime-kuma'
import wordpress from './wordpress'

export const templates: Template[] = [authentik, directus, gitlab, n8n, plausible, umami, uptimeKuma, wordpress]

export function templateNeedsDomain(template: Template) {
  return Object.values(template.services).some(service => service.type === 'image' && Object.values(service.variables ?? {}).some(value => value.includes('${domain}')))
}
