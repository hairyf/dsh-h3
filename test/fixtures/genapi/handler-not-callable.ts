import { defineWebServer } from 'dsh-h3'

const notCallable = (() => ({ ok: true })) as never

export const server = defineWebServer((app) => {
  app.get('/api/not-callable', notCallable)
})
