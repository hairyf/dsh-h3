/// <reference types="@deepseek-ai/dsh-host-webserver" preserve="true" />

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { H3Route } from 'h3'
import { ServerResponse } from 'node:http'
import { H3 } from 'h3'
import { toNodeHandler } from 'h3/node'

/** 每次激活的 Cordis 服务实例，供请求上下文访问。 */

export interface HostServiceInstance<Options = undefined> {
  context: Context
  options: Options
}

export type HostService<Options = undefined> = (undefined extends Options
  ? (ctx: Context, options?: Options) => () => void
  : (ctx: Context, options: Options) => () => void) & {
    __host_instance?: HostServiceInstance<Options>
  }

// ============================================================================
// 常量与预编译正则 (Constants)
// ============================================================================

/** 匹配动态路由参数的正则前缀位置 */
const DYNAMIC_ROUTE_RE = /\/[^/]*[:*({]/

/** 将原生 H3 路由注册到宿主 WebServer，并返回每次激活的卸载函数。 */

export function defineWebServer<Options = undefined>(setup: (app: H3) => void | H3): HostService<Options> {
  if (typeof setup !== 'function')
    throw new TypeError('dsh-h3: defineWebServer requires a setup callback')

  const server = function (ctx: Context, options?: Options): () => void {
    const webServer = ctx?.webServer
    if (typeof webServer?.register !== 'function') {
      throw new TypeError('dsh-h3: server(ctx) requires the webServer service')
    }

    const instance: HostServiceInstance<Options> = { context: ctx, options: options as Options }
    const app = new H3()

    // 绑定当前服务实例到请求上下文
    app.use((event) => {
      event.context.__host_instance = instance
    })

    const result = setup(app)
    if (result !== undefined && result !== app) {
      throw new TypeError('dsh-h3: setup must be synchronous and return nothing or the app')
    }

    // 按宿主路由分组整理已注册的 H3 路由
    const groups = new Map<string, { route: Omit<WebRoute, 'handler'>, methods: Set<string>, routes: H3Route[] }>()
    for (const h3Route of app['~routes']) {
      const route = hostRouteOf(h3Route.route!)
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
      // 倒序卸载服务
      for (const unregister of disposers.splice(0).reverse()) {
        unregister()
      }
      if (server.__host_instance === instance) {
        delete server.__host_instance
      }
    }

    try {
      for (const { route, methods, routes } of groups.values()) {
        // 宿主接管路径优先级：隔离 H3 避免 HEAD / all / patterns 溢出作用域
        const routedApp = new H3({ ...app.config, plugins: undefined })
        routedApp['~middleware'] = app['~middleware']

        for (const h3Route of routes) {
          routedApp['~addRoute'](h3Route)
        }

        const handler = toNodeHandler(routedApp)
        const dispose = webServer.register({
          ...route,
          handler: async (req, res) => {
            const method = req.method ?? 'GET'

            // 检查请求方法是否被允许
            if (!methods.has('') && !methods.has(method) && !(method === 'HEAD' && methods.has('GET'))) {
              const allowed = new Set(methods)
              if (allowed.has('GET')) {
                allowed.add('HEAD')
              }
              res.writeHead(405, { allow: [...allowed].join(', ') })
              res.end()
              return
            }

            // 修正部分中间件导致的 res.end 回调缺失问题
            patchResponseEnd(res)
            await handler(req, res)
          },
        })
        disposers.push(dispose)
      }
    }
    catch (error) {
      dispose()
      throw error
    }

    server.__host_instance = instance
    return dispose
  } as HostService<Options>

  return server
}

// ============================================================================
// 辅助函数 (Helper Functions)
// ============================================================================

/**
 * 确保响应对象的 res.end 能在 finish 事件后正确触发回调
 */
function patchResponseEnd(res: ServerResponse): void {
  const originalEnd = res.end
  res.end = function (chunk?: string | Uint8Array | (() => void), encoding?: BufferEncoding | (() => void), callback?: () => void) {
    const done = typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : callback
    const chunkData = typeof chunk === 'function' ? undefined : chunk
    const encodingStr = typeof encoding === 'string' ? encoding : 'utf8'

    if (this.writableEnded)
      return ServerResponse.prototype.end.call(this, chunkData, encodingStr, done)

    if (done)
      this.once('finish', done)

    return originalEnd.call(this, chunkData, encodingStr)
  }
}

/** 从 H3 pattern 推导并校验宿主路由规则。 */
function hostRouteOf(pattern: string): Omit<WebRoute, 'handler'> {
  const dynamicIndex = pattern.search(DYNAMIC_ROUTE_RE)

  if (dynamicIndex === 0) {
    throw new TypeError('dsh-h3: root-level patterns need a WebServer fallback; use a static prefix for named routes')
  }

  const kind = dynamicIndex < 0 ? 'exact' : 'prefix'
  const path = dynamicIndex < 0
    ? pattern === '/' ? pattern : pattern.replace(/\/$/, '')
    : pattern.slice(0, dynamicIndex)

  if (!path.startsWith('/') || path.startsWith('//') || (path !== '/' && path.endsWith('/')) || /[?#\\]/.test(path) || new URL(path, 'http://localhost').pathname !== path) {
    throw new TypeError('dsh-h3: route path must be an absolute pathname without a trailing slash')
  }

  return { kind, path }
}
