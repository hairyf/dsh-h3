import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
const parenthesized = (handler)
const asserted = handler as typeof handler
const satisfied = handler satisfies typeof handler
const nonNull = handler!
const angled = <typeof handler>handler
const objectForm = defineEventHandler({ handler: () => ({ objectForm: true }) })

export const server = defineWebServer((app) => {
  app.get('/api/unwrap/parenthesized', parenthesized)
  app.get('/api/unwrap/asserted', asserted)
  app.get('/api/unwrap/satisfied', satisfied)
  app.get('/api/unwrap/non-null', nonNull)
  app.get('/api/unwrap/type-assertion', angled)
  app.get('/api/unwrap/object-form', objectForm)
})
