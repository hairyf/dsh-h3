import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
const kind = 'exact' as const
const path = '/api/shorthand'

export const server = defineWebServer((app) => {
  app.get({ kind, path }, handler)
})
