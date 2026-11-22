import { homedir } from 'node:os'
import { join } from 'node:path'
import { version } from './package.json'

const admin = { auth: { user: { role: 'admin' } } }

export default defineNuxtConfig({
  modules: ['@nuxtjs/better-auth', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  auth: {
    redirects: { authenticated: '/', logout: '/login' }
  },
  routeRules: {
    '/**': { auth: 'user' },
    '/login': { auth: 'guest' },
    '/setup': { auth: 'guest' },
    '/api/setup': { auth: false },
    '/join/**': { auth: 'guest' },
    '/api/join/**': { auth: false },
    '/api/hooks/**': { auth: false },
    '/api/join-scripts/**': { auth: false },
    '/servers/**': admin,
    '/api/servers/**': admin,
    '/metrics/**': admin,
    '/api/metrics/**': admin,
    '/certificates/**': admin,
    '/api/certificates/**': admin,
    '/backup-destinations/**': admin,
    '/api/backup-destinations/**': admin,
    '/members/**': admin,
    '/api/members/**': admin,
    '/invitations/**': admin,
    '/api/invitations/**': admin,
    '/settings/**': admin,
    '/api/settings/**': admin,
    '/api/github/**': admin,
    '/api/git-connections/**': admin
  },
  runtimeConfig: {
    databaseUrl: '',
    version,
    releaseUrl: 'https://api.github.com/repos/harblet/harblet/releases/latest',
    kubernetes: {
      url: '',
      serviceAccountDir: '/var/run/secrets/kubernetes.io/serviceaccount'
    }
  },
  $development: {
    runtimeConfig: {
      kubernetes: {
        url: 'https://127.0.0.1:6443',
        serviceAccountDir: join(homedir(), '.lima/harblet/kubernetes')
      }
    }
  }
})
