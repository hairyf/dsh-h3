import { defineWebServer } from 'dsh-h3'
import { readEcho, writeEcho } from './routes/echo'
import health from './routes/health'
import inspect from './routes/inspect'
import serverInfo from './routes/server'

export interface ServerOptions {
  startedAt: number
}

export const server = defineWebServer<ServerOptions>((app) => {
  app.get('/api/health', health)
  app.get('/api/server', serverInfo)
  app.get('/api/inspect/**', inspect)
  app.get('/api/echo/:channel', readEcho)
  app.post('/api/echo/:channel', writeEcho)
})
