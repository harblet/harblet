export interface LogInstance {
  id: string
  pod: string
  server?: string
  state: 'running' | 'waiting' | 'terminated'
  reason?: string
  restarts: number
  previous: boolean
}
