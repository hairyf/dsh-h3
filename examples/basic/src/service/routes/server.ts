import { getSeviceContext } from 'dsh-h3/utils'
import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const ctx = getSeviceContext(event)
  return { port: ctx.webServer.port }
})
