import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const handler = defineEventHandler(() => ({ ok: true }))
const onArguments: [string, typeof handler] = ['/api/on-short', handler]

export const server = defineWebServer((app) => {
  app.on('get', ...onArguments)
})
