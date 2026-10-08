import { defineWebServer } from 'dsh-h3'

export const server = defineWebServer((app) => {
  app.use(() => ({ middleware: true }))
})
