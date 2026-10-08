import { defineWebServer } from 'dsh-h3'
import defaultHandler, { functionHandler, namedHandler } from './shared-handlers'

export const server = defineWebServer((app) => {
  app.get('/api/imported/named', namedHandler)
  app.get('/api/imported/function', functionHandler)
  app.get('/api/imported/default', defaultHandler)
})
