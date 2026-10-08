import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
let rebound = handler
rebound = handler

export const server = defineWebServer((app) => {
  app.get('/api/not-const', rebound)
})
