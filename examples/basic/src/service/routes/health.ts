import type { ServiceOptions } from '..'
import { getSeviceOptions } from 'dsh-h3/utils'
import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const { startedAt } = getSeviceOptions<ServiceOptions>(event)
  return { status: 'ok', uptimeMs: Date.now() - startedAt }
})
