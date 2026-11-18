import type { Template } from '../types/template'

export default {
  id: 'umami',
  name: 'Umami',
  description: 'Web analytics that respects your visitors\' privacy.',
  icon: 'i-simple-icons-umami',
  website: 'https://umami.is',
  note: 'Log in as admin with the password umami, then change it.',
  domain: 'umami',
  services: {
    database: {
      type: 'postgres',
      name: 'Umami database',
      version: '18',
      databaseUser: 'umami',
      databaseName: 'umami'
    },
    umami: {
      type: 'image',
      name: 'Umami',
      image: 'ghcr.io/umami-software/umami:latest',
      port: 3000,
      healthCheckPath: '/api/heartbeat',
      variables: {
        DATABASE_URL: '${database.url}',
        APP_SECRET: '${secret}',
        TWO_FACTOR_ENCRYPTION_KEY: '${secret}'
      }
    }
  }
} satisfies Template
