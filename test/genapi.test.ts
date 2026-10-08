import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { defineConfig } from '@genapi/core'
import pipeline, { compiler, config, dest, generate } from '@genapi/pipeline'
import { parser } from '@genapi/presets/swag-ofetch-ts'
import { context } from '@genapi/shared'
import { original } from 'dsh-h3/genapi'
import { ofetch } from 'ofetch'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import basicConfig from '../examples/basic/genapi.config'

const temp = fileURLToPath(new URL('../temp', import.meta.url))
const roots: string[] = []
const run = pipeline(config, original, parser, compiler, generate, dest)

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== temp || !root.startsWith(join(temp, 'genapi-')))
      throw new Error(`Unexpected fixture root: ${root}`)
    rmSync(root, { recursive: true, force: true })
  }
  for (const key of Object.keys(context))
    delete context[key]
})

function fixture(files: Record<string, string>) {
  mkdirSync(temp, { recursive: true })
  const root = mkdtempSync(join(temp, 'genapi-'))
  roots.push(root)
  for (const [file, source] of Object.entries(files)) {
    const target = join(root, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, source)
  }
  return {
    root,
    settings: defineConfig({
      preset: run,
      input: join(root, 'host/routes/index.ts'),
      output: { main: relative(process.cwd(), join(root, 'client/apis/index.ts')), type: relative(process.cwd(), join(root, 'client/apis/index.type.ts')) },
    }),
  }
}

function diagnostics(files: string[]): string[] {
  const program = ts.createProgram(files, { strict: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, types: ['node'], noEmit: true })
  return ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

it('regenerates the checked-in basic clients using its actual configuration', async () => {
  const { root, settings } = fixture({})
  if (typeof basicConfig.preset !== 'function')
    throw new TypeError('The basic example must configure a pipeline')
  await basicConfig.preset({
    ...basicConfig,
    input: fileURLToPath(new URL(`../examples/basic/${basicConfig.input}`, import.meta.url)),
    output: settings.output,
  })
  const main = readFileSync(join(root, 'client/apis/index.ts'), 'utf8')
  const types = readFileSync(join(root, 'client/apis/index.type.ts'), 'utf8')
  expect(main).toContain('export function getApiHealth(options?: FetchOptions)')
  expect(main).toContain('export function getApiServer(options?: FetchOptions)')
  expect(main).toContain('export function getApiInspect(options?: FetchOptions)')
  expect(main).not.toContain('dsh-h3')
  expect(types).toContain('status: string; uptimeMs: number')
  expect(types).toContain('port: number')
  for (const file of ['index.ts', 'index.type.ts']) {
    const generated = readFileSync(join(root, 'client/apis', file), 'utf8').replace(/\r\n/g, '\n')
    const committed = readFileSync(new URL(`../examples/basic/src/client/apis/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(generated).toBe(committed)
  }
  expect(diagnostics([join(root, 'client/apis/index.ts')])).toEqual([])
})

it('uses actual registrations, preserves named contracts and calls the host with generated clients', async () => {
  const { root, settings } = fixture({
    'host/routes/index.ts': `import { defineWebServer as serverOf } from 'dsh-h3'
import echo from './echo'
const unusedFactory = () => serverOf(app => app.get('/api/ghost', echo))
export const server = serverOf((app) => {
  return app.on('POST', { kind: 'exact', path: '/api/echo/:literal' }, echo).post('/api/echo/:id', echo)
  app.get('/api/never', echo)
})`,
    'host/contracts.ts': `export interface Query { mode: 'brief' | 'full'; label?: string }
export interface Body { name: string; nested?: { count: number; kind: 'a' | 'b' } }
export enum Kind { Ok = 'ok', Failed = 'failed' }
export type Result = { kind: Kind.Ok; name: string; id: string | undefined } | { kind: Kind.Failed; reason: string }`,
    'host/routes/echo.ts': `import type { Body, Query as Search, Result } from '../contracts'
import { defineEventHandler as handler, getQuery, readBody, getRouterParam } from 'h3'
import { Kind } from '../contracts'
export default handler(async (event): Promise<Result> => {
  const query = getQuery<Search>(event)
  const body = await readBody<Body>(event)
  if (!body || query.mode === 'brief') return { kind: Kind.Failed, reason: 'brief' }
  return { kind: Kind.Ok, name: body.name, id: getRouterParam(event, 'id') }
})`,
    'host/routes/unused.ts': `throw new Error('not registered')`,
  })
  await run(settings)
  const main = join(root, 'client/apis/index.ts')
  const typeFile = join(root, 'client/apis/index.type.ts')
  const types = readFileSync(typeFile, 'utf8')
  expect(readFileSync(main, 'utf8')).not.toContain('/api/never')
  expect(readFileSync(main, 'utf8')).not.toContain('/api/ghost')
  expect(readFileSync(main, 'utf8')).toContain('/api/echo/:literal')
  expect(readFileSync(main, 'utf8')).toContain(`/api/echo/\${paths.id}`)
  expect(types).toContain('"brief" | "full"')
  expect(types).toContain('nested?:')
  expect(types).toContain('"a" | "b"')
  expect(types).toContain('kind: "failed"')
  expect(diagnostics([main])).toEqual([])
  const clients = await import(pathToFileURL(main).href)
  const host = await import(pathToFileURL(join(root, 'host/routes/index.ts')).href)
  const ctx = new Context()
  try {
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    ctx.effect(() => host.server(ctx), 'genapi:routes')
    const baseURL = `http://127.0.0.1:${ctx.webServer.port}`
    const http = ofetch.create({ baseURL })
    expect(await http('/api/echo/client', { method: 'POST', query: { mode: 'full' }, body: { name: 'Bob' } })).toEqual({ kind: 'ok', name: 'Bob', id: 'client' })
    expect(await clients.postApiEchoId({ mode: 'full' }, { id: 'item' }, { name: 'Alice' }, { baseURL })).toEqual({ kind: 'ok', name: 'Alice', id: 'item' })
    expect(await clients.postApiEchoLiteral({ mode: 'brief' }, { name: 'Alice' }, { baseURL })).toEqual({ kind: 'failed', reason: 'brief' })
  }
  finally {
    await ctx.fiber.dispose()
  }
})

it('rejects dynamic registrations, duplicates and unsupported contracts instead of silently generating wrong clients', () => {
  for (const [body, expected] of [
    [`if (true) app.get('/api/health', handler)`, 'conditional'],
    [`app.get('/api/health', handler); app.get('/api/health', handler)`, 'duplicate GET'],
    [`app.get('/api/**', handler)`, 'simple :parameter'],
    [`app.get('/api/health', handler); const later = app.get('/api/hidden', handler)`, 'direct app.method'],
  ]) {
    const { settings } = fixture({ 'host/routes/index.ts': `import { defineWebServer } from 'dsh-h3'; import { defineEventHandler } from 'h3'; const handler = defineEventHandler(() => ({ ok: true })); export const server = defineWebServer((app) => { ${body} })` })
    expect(() => original(config(settings))).toThrow(expected)
  }
  const missing = fixture({}).settings
  expect(() => original(config(missing))).toThrow('cannot read service entry')
})
