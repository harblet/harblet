import type { Template } from '../types/template'

const version = '2.47.7'

const variables = {
  DB_TYPE: 'postgresdb',
  DB_POSTGRESDB_HOST: '${database.hostname}',
  DB_POSTGRESDB_PORT: '${database.port}',
  DB_POSTGRESDB_DATABASE: '${database.database}',
  DB_POSTGRESDB_USER: '${database.user}',
  DB_POSTGRESDB_PASSWORD: '${database.password}',
  EXECUTIONS_MODE: 'queue',
  QUEUE_BULL_REDIS_HOST: '${redis.hostname}',
  OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS: 'true',
  N8N_ENCRYPTION_KEY: '${secret.encryption}',
  N8N_RUNNERS_MODE: 'external',
  N8N_RUNNERS_AUTH_TOKEN: '${secret.runners}',
  N8N_RUNNERS_BROKER_LISTEN_ADDRESS: '0.0.0.0',
  N8N_HOST: '${domain}',
  N8N_PROTOCOL: 'https',
  N8N_WEBHOOK_URL: 'https://${domain}/',
  N8N_PROXY_HOPS: '1'
}

export default {
  id: 'n8n',
  name: 'n8n',
  description: 'Workflow automation with a visual editor. Runs in queue mode with one worker and needs about 2 GB of free memory.',
  icon: 'i-simple-icons-n8n',
  website: 'https://n8n.io',
  note: 'Create the owner account right after installing. The first visitor to the address can create it.',
  domain: 'n8n',
  services: {
    database: {
      type: 'postgres',
      name: 'n8n database',
      version: '18',
      databaseUser: 'n8n',
      databaseName: 'n8n'
    },
    redis: {
      type: 'image',
      name: 'n8n Redis',
      image: 'redis:7-alpine',
      port: 6379,
      volumes: ['/data']
    },
    n8n: {
      type: 'image',
      name: 'n8n',
      image: `docker.n8n.io/n8nio/n8n:${version}`,
      port: 5678,
      healthCheckPath: '/healthz',
      variables,
      volumes: ['/home/node/.n8n']
    },
    worker: {
      type: 'image',
      name: 'n8n worker',
      image: `docker.n8n.io/n8nio/n8n:${version}`,
      port: 5679,
      command: 'worker',
      variables
    },
    runner: {
      type: 'image',
      name: 'n8n runner',
      image: `n8nio/runners:${version}`,
      variables: {
        N8N_RUNNERS_AUTH_TOKEN: '${secret.runners}',
        N8N_RUNNERS_TASK_BROKER_URI: 'http://${worker.hostname}:${worker.port}'
      }
    }
  }
} satisfies Template
