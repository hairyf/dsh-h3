import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

declare const enabled: boolean

const handler = defineEventHandler(() => ({ ok: true }))

if (enabled) {
  const nested = defineWebServer((app) => {
    app.get('/api/nested-module', handler)
  })
  void nested
}
