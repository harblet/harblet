import { z } from 'zod'

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

export const metricInterval = 10_000

export const metricRanges = {
  '30m': { duration: 30 * minute, bucket: metricInterval },
  '1h': { duration: hour, bucket: minute },
  '6h': { duration: 6 * hour, bucket: 2 * minute },
  '24h': { duration: day, bucket: 10 * minute },
  '7d': { duration: 7 * day, bucket: hour }
}

export type MetricRange = keyof typeof metricRanges

export const metricsQuerySchema = z.object({
  range: z.enum(['30m', '1h', '6h', '24h', '7d'], 'Choose a range')
})
