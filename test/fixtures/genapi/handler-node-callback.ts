import { defineWebServer } from 'dsh-h3'

const nodeCallback: (request: unknown, response: unknown) => undefined = (_request, _response) => undefined

export const server = defineWebServer((app) => {
  app.get('/api/node-callback', nodeCallback)
})
