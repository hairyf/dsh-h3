import type { Context } from '@deepseek-ai/cordis'
import { service } from './service'

export const name = 'h3-basic'
export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => service(ctx, { startedAt: Date.now() }), 'h3-basic:routes')
}
