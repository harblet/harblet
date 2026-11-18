import type { BadgeProps } from '@nuxt/ui'

const statuses: Record<string, BadgeProps> = {
  running: { label: 'Running', color: 'info', icon: 'i-lucide-loader-circle', ui: { leadingIcon: 'animate-spin' } },
  succeeded: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'error' }
}

export function backupStatusBadge(status: string): BadgeProps {
  return statuses[status] ?? { label: status, color: 'neutral' }
}

export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${exponent && value < 10 ? value.toFixed(1) : Math.round(value)} ${units[exponent]}`
}
