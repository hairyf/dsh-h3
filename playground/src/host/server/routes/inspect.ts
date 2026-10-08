import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(event => ({
  method: event.req.method,
  path: event.url.pathname,
  query: getQuery(event),
}))
