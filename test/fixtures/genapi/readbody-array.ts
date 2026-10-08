import { defineWebServer } from 'dsh-h3'
import { defineEventHandler, readBody } from 'h3'

const handler = defineEventHandler(async (event) => {
  const body = await readBody<string[]>(event)
  return { count: body?.length ?? 0 }
})

export const server = defineWebServer((app) => {
  app.post('/api/readbody-array', handler)
})
