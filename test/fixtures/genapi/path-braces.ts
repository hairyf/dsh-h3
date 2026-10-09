import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

export const server = defineWebServer((app) => {
  app.get('/api/{id}', defineEventHandler(() => ({ ok: true })))
})
