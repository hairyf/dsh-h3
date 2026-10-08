import type { ServerOptions } from '..'
import { getServerOptions } from 'dsh-h3/utils'
import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const { startedAt } = getServerOptions<ServerOptions>(event)
  return { status: 'ok', uptimeMs: Date.now() - startedAt }
})
