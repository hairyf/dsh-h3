import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))

export const server = defineWebServer((app) => {
  const registered = app.get('/api/registered', handler)
  void registered
})
