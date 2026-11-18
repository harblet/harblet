import { pino } from 'pino'

const logger = pino({
  transport: import.meta.dev ? { target: 'pino-pretty' } : undefined
})

export function useLogger(name: string) {
  return logger.child({ name })
}
