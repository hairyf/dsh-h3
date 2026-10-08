import type { HostApp, HostRoute } from 'dsh-h3'
import { Buffer } from 'node:buffer'
import { request } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { defineWebServer } from 'dsh-h3'
import { getServerContext, getServerOptions } from 'dsh-h3/utils'
import { defineEventHandler, getRouterParam, H3, mockEvent, readBody } from 'h3'
import { afterAll, afterEach, beforeAll, expect, expectTypeOf, it, vi } from 'vitest'

const ctx = new Context()
const disposers: Array<() => void | Promise<void>> = []
let base: string

beforeAll(async () => {
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0, compression: 'gzip', compressionThresholdBytes: 1024 })
  base = `http://127.0.0.1:${ctx.webServer.port}`
})

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse())
    await dispose()
})

afterAll(async () => {
  await ctx.fiber.dispose()
})

it('runs the requested API through WebServer and a labeled Cordis effect', async () => {
  const hello = defineEventHandler(event => ({ method: event.req.method }))
  const aaa = defineEventHandler(async (event) => {
    return { body: await readBody(event), middleware: event.context.marker }
  })
  const bbb = defineEventHandler(event => event.url.pathname + event.url.search)
  const service = defineWebServer((app) => {
    expect(app).toBeInstanceOf(H3)
    app.use((event) => {
      event.context.marker = 'seen'
    })
    app.post('/hello', (req, res) => {
      res.end('posted')
    })
    app.get('/hello', hello)
    app.post({ kind: 'exact', path: '/aaa' }, aaa)
    app.post({ kind: 'prefix', path: '/bbb' }, bbb)
  })
  const register = vi.spyOn(ctx.webServer, 'register')
  const dispose = ctx.effect(() => service(ctx), 'custom-label')
  disposers.push(dispose)
  expect(register).toHaveBeenCalledTimes(3)
  register.mockRestore()

  expect(await (await fetch(`${base}/hello`)).json()).toEqual({ method: 'GET' })
  expect(await (await fetch(`${base}/hello`, { method: 'POST' })).text()).toBe('posted')
  expect(await (await fetch(`${base}/aaa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 42 }),
  })).json()).toEqual({ body: { value: 42 }, middleware: 'seen' })
  for (const path of ['/bbb', '/bbb/child?query=1'])
    expect(await (await fetch(`${base}${path}`, { method: 'POST' })).text()).toBe(path)
  expect((await fetch(`${base}/bbbb`, { method: 'POST' })).status).toBe(404)
  expect((await fetch(`${base}/aaa/child`, { method: 'POST' })).status).toBe(404)
  expect((await fetch(`${base}/hello`, { method: 'HEAD' })).status).toBe(200)
  const wrongMethod = await fetch(`${base}/hello`, { method: 'PUT' })
  expect(wrongMethod.status).toBe(405)
  expect(wrongMethod.headers.get('allow')).toContain('HEAD')

  await dispose()
  expect((await fetch(`${base}/hello`)).status).toBe(404)
  const replacement = defineWebServer(app => app.get('/hello', () => 'replacement'))
  disposers.push(replacement(ctx))
  await dispose()
  expect(await (await fetch(`${base}/hello`)).text()).toBe('replacement')
})

it('binds service and event context/options to each activation and clears disposed instances', async () => {
  interface Options { name: string }
  const first = { name: 'first' }
  const second = { name: 'second' }
  const capturedContexts: Context[] = []
  const capturedOptions: Options[] = []
  const service = defineWebServer<Options>((app) => {
    app.use((event) => {
      capturedContexts.push(getServerContext(event))
    })
    app.mount('/instance', new H3().get('/', defineEventHandler((event) => {
      const options = getServerOptions<Options>(event)
      capturedOptions.push(options)
      return { name: options.name, port: getServerContext(event).webServer.port }
    })))
  })
  expect(() => getServerContext(service)).toThrow('service is not active')
  expect(() => getServerOptions(service)).toThrow('service is not active')
  const event = mockEvent('/instance')
  expect(() => getServerContext(event)).toThrow('event does not belong')
  expect(() => getServerOptions(event)).toThrow('event does not belong')

  const disposeFirst = service(ctx, first)
  disposers.push(disposeFirst)
  const firstInstance = service.__instance
  expect(getServerContext(service)).toBe(ctx)
  expect(getServerOptions(service)).toBe(first)
  expectTypeOf(getServerOptions(service)).toEqualTypeOf<Options>()
  expect(() => service(ctx, second)).toThrow('duplicate exact route')
  expect(service.__instance).toBe(firstInstance)

  const other = new Context()
  disposers.push(() => other.fiber.dispose())
  await other.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  const otherBase = `http://127.0.0.1:${other.webServer.port}`
  const disposeSecond = service(other, second)
  disposers.push(disposeSecond)
  expect(getServerContext(service)).toBe(other)
  expect(getServerOptions(service)).toBe(second)
  expect(await (await fetch(`${base}/instance`)).json()).toEqual({ name: 'first', port: ctx.webServer.port })
  expect(await (await fetch(`${otherBase}/instance`)).json()).toEqual({ name: 'second', port: other.webServer.port })
  expect(capturedContexts).toEqual([ctx, other])
  expect(capturedOptions[0]).toBe(first)
  expect(capturedOptions[1]).toBe(second)

  disposeFirst()
  expect(getServerContext(service)).toBe(other)
  disposeSecond()
  expect(service.__instance).toBeUndefined()
  expect(() => getServerOptions(service)).toThrow('service is not active')
  disposers.push(service(ctx, first))
  expect(getServerContext(service)).toBe(ctx)
  expect(getServerOptions(service)).toBe(first)
})

it('supports services without options', async () => {
  const service = defineWebServer(app => app.get('/no-options', defineEventHandler((event) => {
    expect(getServerOptions(event)).toBeUndefined()
    expect(getServerContext(event)).toBe(ctx)
    return { ok: true }
  })))
  disposers.push(service(ctx))
  expect(getServerOptions(service)).toBeUndefined()
  expectTypeOf(getServerOptions(service)).toEqualTypeOf<undefined>()
  expect(await (await fetch(`${base}/no-options`)).json()).toEqual({ ok: true })
})

it('keeps exact and longest-prefix method ownership', async () => {
  disposers.push(defineWebServer((app) => {
    app.post({ kind: 'prefix', path: '/scope' }, () => 'outer')
    app.get({ kind: 'prefix', path: '/scope/nested' }, () => 'inner')
    app.get('/scope/exact', () => 'exact')
  })(ctx))
  expect(await (await fetch(`${base}/scope/nested/child`)).text()).toBe('inner')
  expect((await fetch(`${base}/scope/nested/child`, { method: 'POST' })).status).toBe(405)
  expect((await fetch(`${base}/scope/exact`, { method: 'POST' })).status).toBe(405)
})

it('keeps HEAD fallback and literal descriptors within the selected host group', async () => {
  const outer = vi.fn(() => 'outer')
  const exact = vi.fn(() => 'exact')
  disposers.push(defineWebServer((app) => {
    app.head({ kind: 'prefix', path: '/ownership' }, outer)
    app.get('/ownership/exact', exact)
    app.get({ kind: 'prefix', path: '/ownership/nested' }, exact)
    app.get({ kind: 'prefix', path: '/literal' }, () => 'prefix')
    app.get({ kind: 'exact', path: '/literal/:id' }, () => 'colon')
    app.get({ kind: 'exact', path: '/literal/*' }, () => 'star')
    app.get({ kind: 'exact', path: '/literal/%78' }, () => 'encoded')
    app.get({ kind: 'exact', path: '/literal/x' }, () => 'plain')
  })(ctx))
  for (const path of ['/ownership/exact', '/ownership/nested/child'])
    expect((await fetch(`${base}${path}`, { method: 'HEAD' })).status).toBe(200)
  expect(exact).toHaveBeenCalledTimes(2)
  expect(outer).not.toHaveBeenCalled()
  for (const [path, body] of [['/literal/other', 'prefix'], ['/literal/:id', 'colon'], ['/literal/*', 'star'], ['/literal/%78', 'encoded'], ['/literal/x', 'plain']])
    expect(await (await fetch(`${base}${path}`)).text()).toBe(body)
})

it('preserves native middleware, routing options, patterns, mounted apps and chaining', async () => {
  let captured: HostApp | undefined
  const child = new H3().get('/', () => 'child root').get('/child', event => ({ marker: event.context.marker }))
  disposers.push(defineWebServer((app) => {
    captured = app
    app.use((event) => {
      event.context.marker = 'native'
    })
    app.mount('/mounted', child)
    expect(app.get('/users/:id', defineEventHandler(event => ({ id: getRouterParam(event, 'id'), middleware: event.context.local })), {
      middleware: [(event) => { event.context.local = true }],
    })).toBe(app)
    app.get('/files/**', defineEventHandler(event => event.url.pathname))
    app.get('/inline/file-:id', defineEventHandler(event => getRouterParam(event, 'id')))
  })(ctx))
  expect(await (await fetch(`${base}/mounted`)).text()).toBe('child root')
  expect(await (await fetch(`${base}/mounted/child`)).json()).toEqual({ marker: 'native' })
  expect(await (await fetch(`${base}/inline/file-456`)).text()).toBe('456')
  expect(await (await fetch(`${base}/users/123`)).json()).toEqual({ id: '123', middleware: true })
  expect(await (await fetch(`${base}/files/a/b`)).text()).toBe('/files/a/b')
  expect(await (await captured!.request('/users/direct')).json()).toEqual({ id: 'direct', middleware: true })
})

it('rolls back partial registration without removing existing routes', async () => {
  disposers.push(defineWebServer(app => app.get('/occupied', () => 'existing'))(ctx))
  expect(() => defineWebServer((app) => {
    app.get('/temporary', () => 'temporary')
    app.get('/occupied', () => 'conflict')
  })(ctx)).toThrow('duplicate exact route')
  expect((await fetch(`${base}/temporary`)).status).toBe(404)
  expect(await (await fetch(`${base}/occupied`)).text()).toBe('existing')
  const dispose = defineWebServer(app => app.get('/temporary', () => 'new'))(ctx)
  dispose()
  const replacement = defineWebServer(app => app.get('/temporary', () => 'replacement'))(ctx)
  disposers.push(replacement)
  dispose()
  expect(await (await fetch(`${base}/temporary`)).text()).toBe('replacement')
})

it('validates route declarations before any registration', () => {
  const invalid = [
    { kind: 'other', path: '/invalid' },
    { kind: 'exact', path: 'relative' },
    { kind: 'exact', path: '/invalid/' },
    { kind: 'prefix', path: '/invalid?query' },
    { kind: 'exact', path: '/invalid#fragment' },
    { kind: 'exact', path: '//example.com' },
    { kind: 'exact', path: '/a/../b' },
    { kind: 'exact', path: '/has space' },
  ]
  const register = vi.spyOn(ctx.webServer, 'register')
  for (const route of invalid) {
    expect(() => defineWebServer((app) => {
      app.get('/otherwise-valid', () => 'unused')
      app.get(route as HostRoute, () => 'invalid')
    })(ctx)).toThrow(TypeError)
  }
  expect(register).not.toHaveBeenCalled()
  register.mockRestore()
  expect(() => defineWebServer(app => app.get('/:id', () => 'root pattern'))(ctx)).toThrow('root-level patterns')
  expect(() => defineWebServer(() => {})(new Context())).toThrow('webServer service')
})

it('keeps large responses compressed and Node end callbacks working', async () => {
  const body = 'large gzip response '.repeat(256)
  const onEnd = vi.fn()
  const onRepeatedEnd = vi.fn()
  disposers.push(defineWebServer((app) => {
    app.get('/large', () => new Response(body, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=60' } }))
    app.get('/large-node', (req, res) => {
      res.setHeader('content-type', 'text/plain')
      res.setHeader('content-length', Buffer.byteLength(body))
      res.end(body, () => {
        onEnd()
        res.end(onRepeatedEnd)
      })
    })
  })(ctx))
  for (const path of ['/large', '/large-node']) {
    const response = await new Promise<{ encoding: string | string[] | undefined, body: Buffer }>((resolve, reject) => {
      const req = request(`${base}${path}`, { headers: { 'accept-encoding': 'gzip' } }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) }))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.setTimeout(3000, () => req.destroy(new Error('gzip response timed out')))
      req.end()
    })
    expect(response.encoding).toBe('gzip')
    expect(gunzipSync(response.body).toString()).toBe(body)
  }
  expect(onEnd).toHaveBeenCalledOnce()
  expect(onRepeatedEnd).toHaveBeenCalledWith(expect.objectContaining({ code: 'ERR_STREAM_ALREADY_FINISHED' }))
})
