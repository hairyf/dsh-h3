import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))

export const server = defineWebServer((app) => {
  app.get({ kind: 'exact', path: '/api/literal-exact' }, handler)
  app.get({ kind: 'prefix', path: '/api/literal-prefix' }, handler)
  app.get({ kind: 'exact', path: '/' }, handler)
})
