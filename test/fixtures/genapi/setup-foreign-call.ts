import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const helper = { run: (...args: unknown[]) => args.length }
const handler = defineEventHandler(() => ({ ok: true }))

export const server = defineWebServer((_app) => {
  helper.run('/api/helper', handler)
})
