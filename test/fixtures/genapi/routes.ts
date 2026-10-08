import { defineWebServer } from 'dsh-h3'
import { defineEventHandler, getQuery, readBody } from 'h3'

interface EchoQuery {
  pretty?: boolean
  limit?: number
}

interface EchoBody {
  message: string
}

const readEcho = defineEventHandler(event => ({ query: getQuery<EchoQuery>(event) }))

const writeEcho = defineEventHandler<{ body: EchoBody }, Promise<{ message: string }>>(async (event) => {
  const body = await readBody(event)
  return { message: body?.message ?? '' }
})

export const server = defineWebServer((app) => {
  app.get('/api/health', defineEventHandler(() => ({ status: 'ok' })))
  app.get('/api/userID/list', defineEventHandler(() => ({ users: [{ id: 1 }] })))
  app.get('/api/echo/:channel', readEcho)
  app.post('/api/echo/:channel', writeEcho)
})
