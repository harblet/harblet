import type { BadgeProps } from '@nuxt/ui'

const statuses: Record<string, BadgeProps> = {
  queued: { label: 'Queued', color: 'neutral', icon: 'i-lucide-clock' },
  building: { label: 'Building', color: 'info', icon: 'i-lucide-loader-circle', ui: { leadingIcon: 'animate-spin' } },
  deploying: { label: 'Deploying', color: 'info', icon: 'i-lucide-loader-circle', ui: { leadingIcon: 'animate-spin' } },
  succeeded: { label: 'Deployed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'neutral' }
}

export function deploymentStatusBadge(status?: string): BadgeProps {
  return (status && statuses[status]) || { label: 'Not deployed', color: 'neutral' }
}

export function formatDuration(from: string | Date, to: string | Date) {
  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
