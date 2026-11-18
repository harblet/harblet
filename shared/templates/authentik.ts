import type { Template } from '../types/template'

const image = 'ghcr.io/goauthentik/server:2026.8.5'

const variables = {
  AUTHENTIK_SECRET_KEY: '${secret.key}',
  AUTHENTIK_POSTGRESQL__HOST: '${database.hostname}',
  AUTHENTIK_POSTGRESQL__NAME: '${database.database}',
  AUTHENTIK_POSTGRESQL__USER: '${database.user}',
  AUTHENTIK_POSTGRESQL__PASSWORD: '${database.password}'
}

export default {
  id: 'authentik',
  name: 'authentik',
  description: 'Single sign-on and user management for your apps, with OIDC, SAML and LDAP. Needs about 2 GB of free memory.',
  icon: 'i-simple-icons-authentik',
  website: 'https://goauthentik.io',
  note: 'Log in as akadmin with the password in the worker\'s AUTHENTIK_BOOTSTRAP_PASSWORD variable. Uploaded files need S3 storage, which you set up in the variables of both services.',
  domain: 'server',
  services: {
    database: {
      type: 'postgres',
      name: 'authentik database',
      version: '18',
      databaseUser: 'authentik',
      databaseName: 'authentik'
    },
    server: {
      type: 'image',
      name: 'authentik',
      image,
      port: 9000,
      command: 'server',
      healthCheckPath: '/-/health/ready/',
      startTimeout: 10,
      variables
    },
    worker: {
      type: 'image',
      name: 'authentik worker',
      image,
      command: 'worker',
      variables: {
        ...variables,
        AUTHENTIK_BOOTSTRAP_PASSWORD: '${secret}',
        AUTHENTIK_BOOTSTRAP_EMAIL: 'admin@example.com'
      }
    }
  }
} satisfies Template
