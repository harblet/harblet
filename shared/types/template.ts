import type { DatabaseType } from '../schemas/service'

export interface TemplateImage {
  type: 'image'
  name: string
  image: string
  worker?: boolean
  port?: number
  command?: string
  healthCheckPath?: string
  startTimeout?: number
  variables?: Record<string, string>
  volumes?: string[]
}

export interface TemplateDatabase {
  type: DatabaseType
  name: string
  version: string
  databaseUser: string
  databaseName: string
}

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  website: string
  note?: string
  domain?: string
  services: Record<string, TemplateImage | TemplateDatabase>
}
