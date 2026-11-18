import { z } from 'zod'

export const backupSchedules = {
  off: { label: 'Off', interval: 0 },
  every_15_minutes: { label: 'Every 15 minutes', interval: 15 * 60_000 },
  hourly: { label: 'Every hour', interval: 60 * 60_000 },
  daily: { label: 'Every day', interval: 24 * 60 * 60_000 }
}

export type BackupSchedule = keyof typeof backupSchedules

export const backupParamsSchema = z.object({
  id: z.uuidv7('Invalid backup ID')
})

export const backupSettingsSchema = z.object({
  destinationId: z.uuidv7('Choose a destination'),
  schedule: z.enum(['off', 'every_15_minutes', 'hourly', 'daily'], 'Choose a schedule'),
  retention: z.int('Enter a whole number').min(1, 'Keep at least 1 backup').max(100, 'Keep at most 100 backups')
})
