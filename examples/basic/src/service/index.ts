import { defineHostService } from 'dsh-h3'
import health from './routes/health'
import inspect from './routes/inspect'
import server from './routes/server'

export interface ServiceOptions {
  startedAt: number
}

export const service = defineHostService<ServiceOptions>((app) => {
  app.get('/api/h3-basic/health', health)
  app.get({ kind: 'exact', path: '/api/h3-basic/server' }, server)
  app.get({ kind: 'prefix', path: '/api/h3-basic/inspect' }, inspect)
})
