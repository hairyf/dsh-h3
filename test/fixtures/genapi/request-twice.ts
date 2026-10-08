import { defineWebServer } from 'dsh-h3'
import { defineEventHandler, getQuery } from 'h3'

const handler = defineEventHandler(event => ({
  first: getQuery<{ a?: string }>(event),
  second: getQuery<{ b?: string }>(event),
}))

export const server = defineWebServer((app) => {
  app.get('/api/query-twice', handler)
})
