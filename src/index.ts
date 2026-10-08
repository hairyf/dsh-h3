import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { EventHandlerRequest, H3Route, HTTPHandler, NodeHandler, RouteOptions } from 'h3'
import { ServerResponse } from 'node:http'
import { fromNodeHandler, H3 } from 'h3'
import { toNodeHandler } from 'h3/node'

export type HostRoute = Omit<WebRoute, 'handler'>

export interface HostServiceInstance<Options = undefined> {
  context: Context
  options: Options
}

export type HostService<Options = undefined> = (undefined extends Options
  ? (ctx: Context, options?: Options) => () => void
  : (ctx: Context, options: Options) => () => void) & {
    __instance?: HostServiceInstance<Options>
  }

type Method = Parameters<H3['on']>[0]
interface RouteRegistrar<T> {
  (route: string | HostRoute, handler: WebRoute['handler'], opts?: RouteOptions): T
  <RequestT extends EventHandlerRequest = EventHandlerRequest>(route: string | HostRoute, handler: HTTPHandler<RequestT>, opts?: RouteOptions): T
}

interface OnRegistrar<T> {
  (method: Method, route: string | HostRoute, handler: WebRoute['handler'], opts?: RouteOptions): T
  <RequestT extends EventHandlerRequest = EventHandlerRequest>(method: Method, route: string | HostRoute, handler: HTTPHandler<RequestT>, opts?: RouteOptions): T
}

export interface HostApp extends H3 {
  on: OnRegistrar<this>
  all: RouteRegistrar<this>
  get: RouteRegistrar<this>
  post: RouteRegistrar<this>
  put: RouteRegistrar<this>
  delete: RouteRegistrar<this>
  patch: RouteRegistrar<this>
  head: RouteRegistrar<this>
  options: RouteRegistrar<this>
  connect: RouteRegistrar<this>
  trace: RouteRegistrar<this>
  query: RouteRegistrar<this>
}

export function defineWebServer<Options = undefined>(setup: (app: HostApp) => void | HostApp): HostService<Options> {
  if (typeof setup !== 'function')
    throw new TypeError('dsh-h3: defineWebServer requires a setup callback')

  const server = function (ctx: Context, options?: Options): () => void {
    const webServer = ctx?.webServer
    if (typeof webServer?.register !== 'function')
      throw new TypeError('dsh-h3: server(ctx) requires the webServer service')

    const instance = { context: ctx, options: options as Options }
    const app = new H3() as HostApp
    app.use((event) => {
      event.context.__dshService = instance
    })
    const definitions = new Map<H3Route, HostRoute>()
    app.on = function (method: Method, route: string | HostRoute, handler: HTTPHandler | WebRoute['handler'], opts?: RouteOptions) {
      const definition = typeof route === 'string' ? undefined : validateRoute(route)
      const literal = definition?.path.replace(/[:*+(){}]/g, '\\$&')
      const pattern = typeof route === 'string' ? route : definition!.kind === 'prefix' ? `${literal}/**` : literal!
      H3.prototype.on.call(this, method, pattern, toHandler(handler), opts)
      if (definition)
        definitions.set(this['~routes'].at(-1)!, definition)
      return this
    }

    const result = setup(app)
    if (result !== undefined && result !== app)
      throw new TypeError('dsh-h3: setup must be synchronous and return nothing or the app')

    const groups = new Map<string, { route: HostRoute, methods: Set<string>, routes: H3Route[] }>()
    for (const h3Route of app['~routes']) {
      const route = definitions.get(h3Route) ?? hostRouteOf(h3Route.route!)
      const key = `${route.kind}\0${route.path}`
      let group = groups.get(key)
      if (!group) {
        group = { route, methods: new Set(), routes: [] }
        groups.set(key, group)
      }
      group.methods.add(h3Route.method ?? '')
      group.routes.push(h3Route)
    }

    const disposers: Array<() => void> = []
    const dispose = (): void => {
      for (const unregister of disposers.splice(0).reverse())
        unregister()
      if (server.__instance === instance)
        delete server.__instance
    }

    try {
      for (const { route, methods, routes } of groups.values()) {
        // The host owns path precedence; isolate H3 so HEAD/all/patterns cannot escape it.
        const routedApp = new H3({ ...app.config, plugins: undefined })
        routedApp['~middleware'] = app['~middleware']
        for (const h3Route of routes)
          routedApp['~addRoute'](definitions.has(h3Route) ? { ...h3Route, route: '/**' } : h3Route)
        const node = toNodeHandler(routedApp)
        disposers.push(webServer.register({
          ...route,
          handler: async (req, res) => {
            const method = req.method ?? 'GET'
            if (!methods.has('') && !methods.has(method) && !(method === 'HEAD' && methods.has('GET'))) {
              const allowed = new Set(methods)
              if (allowed.has('GET'))
                allowed.add('HEAD')
              res.writeHead(405, { allow: [...allowed].join(', ') })
              res.end()
              return
            }

            // compression drops res.end(callback); srvx awaits it. Preserve callbacks on finish.
            const end = res.end
            res.end = function (chunk?: string | Uint8Array | (() => void), encoding?: BufferEncoding | (() => void), callback?: () => void) {
              const done = typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : callback
              if (this.writableEnded)
                return ServerResponse.prototype.end.call(this, typeof chunk === 'function' ? undefined : chunk, typeof encoding === 'string' ? encoding : 'utf8', done)
              if (done)
                this.once('finish', done)
              return end.call(this, typeof chunk === 'function' ? undefined : chunk, typeof encoding === 'string' ? encoding : 'utf8')
            }
            await node(req, res)
          },
        }))
      }
    }
    catch (error) {
      dispose()
      throw error
    }
    server.__instance = instance
    return dispose
  } as HostService<Options>
  return server
}

function toHandler<RequestT extends EventHandlerRequest>(handler: HTTPHandler<RequestT> | WebRoute['handler']): HTTPHandler<RequestT> {
  // ponytail: Node callbacks need two declared parameters; use fromNodeHandler for default/rest parameters.
  return typeof handler === 'function' && handler.length > 1
    ? fromNodeHandler(handler as NodeHandler)
    : handler as HTTPHandler<RequestT>
}

function validateRoute(route: HostRoute): HostRoute {
  if (!route || (route.kind !== 'exact' && route.kind !== 'prefix'))
    throw new TypeError('dsh-h3: route kind must be exact or prefix')
  const { kind, path } = route
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || (path !== '/' && path.endsWith('/')) || /[?#\\]/.test(path) || new URL(path, 'http://localhost').pathname !== path)
    throw new TypeError('dsh-h3: route path must be an absolute pathname without a trailing slash')
  return { kind, path }
}

function hostRouteOf(pattern: string): HostRoute {
  // rou3 permits inline parameters, wildcards, constraints and optional groups.
  const dynamic = pattern.search(/\/[^/]*[:*({]/)
  if (dynamic === 0)
    throw new TypeError('dsh-h3: root-level patterns need a WebServer fallback; use a static prefix for named routes')
  return validateRoute(dynamic < 0
    ? { kind: 'exact', path: pattern === '/' ? pattern : pattern.replace(/\/$/, '') }
    : { kind: 'prefix', path: pattern.slice(0, dynamic) })
}
