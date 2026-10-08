import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
const kind: string = 'other'

export const server = defineWebServer((app) => {
  app.get({ kind: kind as 'exact', path: '/api/kind' }, handler)
})
