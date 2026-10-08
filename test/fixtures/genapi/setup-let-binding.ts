import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))

export const server = defineWebServer((app) => {
  // eslint-disable-next-line prefer-const -- genapi must reject non-const route bindings
  let local = handler
  app.get('/api/local', local)
})
