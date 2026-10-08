import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { expect, it } from 'vitest'
import { getApiHealth, getApiInspect, getApiServer } from '../examples/basic/src/client/apis'

it('loads the built basic plugin and removes its routes on unload', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const base = `http://127.0.0.1:${ctx.webServer.port}`
    const basic = await import('../examples/basic/dist/index.mjs')
    const fiber = await ctx.plugin(basic)

    const health = await getApiHealth({ baseURL: base })
    expect(health).toEqual({ status: 'ok', uptimeMs: expect.any(Number) })
    expect(health.uptimeMs).toBeGreaterThanOrEqual(0)
    expect(await getApiServer({ baseURL: base })).toEqual({ port: ctx.webServer.port })
    expect(await getApiInspect({ baseURL: base, query: { query: '1' } })).toEqual({
      method: 'GET',
      path: '/api/inspect',
      query: { query: '1' },
    })
    for (const path of ['/api/inspect', '/api/inspect/request']) {
      expect(await (await fetch(`${base}${path}?query=1`)).json()).toEqual({
        method: 'GET',
        path,
        query: { query: '1' },
      })
    }
    expect((await fetch(`${base}/api/server/child`)).status).toBe(404)
    expect((await fetch(`${base}/api/inspection`)).status).toBe(404)
    expect((await fetch(`${base}/api/health`, { method: 'POST' })).status).toBe(405)

    await fiber.dispose()
    for (const path of ['/api/health', '/api/server', '/api/inspect/request'])
      expect((await fetch(`${base}${path}`)).status).toBe(404)
  }
  finally {
    await ctx.fiber.dispose()
  }
})
