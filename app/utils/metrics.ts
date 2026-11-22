import { metricRanges } from '#shared/schemas/metric'

export const metricRangeItems = Object.keys(metricRanges).map(value => ({ label: value, value }))

export function formatPercent(value: number) {
  return `${value < 10 ? Number(value.toFixed(1)) : Math.round(value)}%`
}

export function formatRate(value?: number | null) {
  return typeof value === 'number' ? `${formatBytes(value)}/s` : undefined
}
