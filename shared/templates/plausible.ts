import type { Template } from '../types/template'

export default {
  id: 'plausible',
  name: 'Plausible',
  description: 'Lightweight web analytics without cookies. Needs about 2 GB of free memory.',
  icon: 'i-simple-icons-plausibleanalytics',
  website: 'https://plausible.io',
  note: 'Register your account right after installing. The first visitor to the address can create it.',
  domain: 'plausible',
  services: {
    database: {
      type: 'postgres',
      name: 'Plausible database',
      version: '18',
      databaseUser: 'plausible',
      databaseName: 'plausible'
    },
    events: {
      type: 'image',
      name: 'Plausible events',
      image: 'clickhouse/clickhouse-server:24.12-alpine',
      port: 8123,
      healthCheckPath: '/ping',
      variables: {
        CLICKHOUSE_SKIP_USER_SETUP: '1'
      },
      volumes: ['/var/lib/clickhouse', '/var/log/clickhouse-server']
    },
    plausible: {
      type: 'image',
      name: 'Plausible',
      image: 'ghcr.io/plausible/community-edition:v3.2.1',
      port: 8000,
      command: 'sh -c "/entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"',
      healthCheckPath: '/api/health',
      variables: {
        BASE_URL: 'https://${domain}',
        SECRET_KEY_BASE: '${secret}',
        DATABASE_URL: '${database.url}',
        CLICKHOUSE_DATABASE_URL: 'http://${events.hostname}:${events.port}/plausible_events_db',
        TMPDIR: '/var/lib/plausible/tmp'
      },
      volumes: ['/var/lib/plausible']
    }
  }
} satisfies Template
