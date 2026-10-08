import { defineWebServer } from 'dsh-h3'
import { defineEventHandler, getQuery, readBody } from 'h3'

interface Payload {
  name: string
  tags?: string[]
}

const write = defineEventHandler((event) => {
  const body = readBody<Payload>(event)
  return { received: !!body }
})

const nested = defineEventHandler((event) => {
  const inner = (): { q?: string } => getQuery<{ q?: string }>(event)
  return { query: inner().q ?? '' }
})

export const server = defineWebServer((app) => {
  app.post('/api/readbody-object', write)
  app.get('/api/nested-query', nested)
})
