import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
const getArguments: [string, typeof handler] = ['/api/get-short', handler]

export const server = defineWebServer((app) => {
  app.get(...getArguments)
})
