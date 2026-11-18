import type { Template } from '../types/template'

export default {
  id: 'directus',
  name: 'Directus',
  description: 'A headless CMS that turns your SQL database into REST and GraphQL APIs with an admin app.',
  icon: 'i-simple-icons-directus',
  website: 'https://directus.io',
  note: 'Log in as admin@example.com with the password in the service\'s ADMIN_PASSWORD variable, then change both.',
  domain: 'directus',
  services: {
    database: {
      type: 'postgres',
      name: 'Directus database',
      version: '18',
      databaseUser: 'directus',
      databaseName: 'directus'
    },
    directus: {
      type: 'image',
      name: 'Directus',
      image: 'directus/directus:12.6.1',
      port: 8055,
      healthCheckPath: '/server/ping',
      variables: {
        SECRET: '${secret}',
        PUBLIC_URL: 'https://${domain}',
        DB_CLIENT: 'pg',
        DB_HOST: '${database.hostname}',
        DB_PORT: '${database.port}',
        DB_DATABASE: '${database.database}',
        DB_USER: '${database.user}',
        DB_PASSWORD: '${database.password}',
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: '${secret}'
      },
      volumes: ['/directus/uploads', '/directus/extensions']
    }
  }
} satisfies Template
