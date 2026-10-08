import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))

export const server = defineWebServer((app) => {
  app.get('/api/:1bad', handler)
})
