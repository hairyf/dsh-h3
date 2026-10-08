import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

declare const flag: boolean

const handler = defineEventHandler(() => ({ ok: true }))

export const server = defineWebServer((app) => {
  if (flag) {
    app.get('/api/conditional', handler)
  }
})
