import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
const descriptor = { kind: 'exact' as const, path: '/api/spread' }

export const server = defineWebServer((app) => {
  app.get({ ...descriptor }, handler)
})
