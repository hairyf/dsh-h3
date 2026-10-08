import { getServerContext } from 'dsh-h3/utils'
import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const ctx = getServerContext(event)
  return { port: ctx.webServer.port }
})
