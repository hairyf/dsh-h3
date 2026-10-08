import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ onClick: () => 1 }))

export const server = defineWebServer((app) => {
  app.get('/api/function-contract', handler)
})
