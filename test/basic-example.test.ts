import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { expect, it } from 'vitest'

it('loads the built basic plugin and removes its routes on unload', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const base = `http://127.0.0.1:${ctx.webServer.port}`
    const basic = await import('../examples/basic/dist/index.mjs')
    const fiber = await ctx.plugin(basic)

    const health = await (await fetch(`${base}/api/h3-basic/health`)).json() as { status: string, uptimeMs: number }
    expect(health).toEqual({ status: 'ok', uptimeMs: expect.any(Number) })
    expect(health.uptimeMs).toBeGreaterThanOrEqual(0)
    expect(await (await fetch(`${base}/api/h3-basic/server`)).json()).toEqual({ port: ctx.webServer.port })
    for (const path of ['/api/h3-basic/inspect', '/api/h3-basic/inspect/request']) {
      expect(await (await fetch(`${base}${path}?query=1`)).json()).toEqual({
        method: 'GET',
        path,
        query: { query: '1' },
      })
    }
    expect((await fetch(`${base}/api/h3-basic/server/child`)).status).toBe(404)
    expect((await fetch(`${base}/api/h3-basic/inspection`)).status).toBe(404)
    expect((await fetch(`${base}/api/h3-basic/health`, { method: 'POST' })).status).toBe(405)

    await fiber.dispose()
    for (const path of ['/api/h3-basic/health', '/api/h3-basic/server', '/api/h3-basic/inspect/request'])
      expect((await fetch(`${base}${path}`)).status).toBe(404)
  }
  finally {
    await ctx.fiber.dispose()
  }
})
