import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
const prefix = '/api'

export const server = defineWebServer((app) => {
  app.get(`${prefix}/dynamic`, handler)
})
