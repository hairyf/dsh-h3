import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ total: 1n }))

export const server = defineWebServer((app) => {
  app.get('/api/bigint', handler)
})
