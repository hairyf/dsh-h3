import { defineWebServer } from 'dsh-h3'
import health from './routes/health'
import inspect from './routes/inspect'
import serverInfo from './routes/server'

export interface ServerOptions {
  startedAt: number
}

export const server = defineWebServer<ServerOptions>((app) => {
  app.get('/api/health', health)
  app.get({ kind: 'exact', path: '/api/server' }, serverInfo)
  app.get({ kind: 'prefix', path: '/api/inspect' }, inspect)
})
