import type { Template } from '../types/template'

export default {
  id: 'uptime-kuma',
  name: 'Uptime Kuma',
  description: 'Monitors your websites and services and alerts you when they go down.',
  icon: 'i-simple-icons-uptimekuma',
  website: 'https://uptime.kuma.pet',
  domain: 'kuma',
  services: {
    kuma: {
      type: 'image',
      name: 'Uptime Kuma',
      image: 'louislam/uptime-kuma:2',
      port: 3001,
      volumes: ['/app/data']
    }
  }
} satisfies Template
