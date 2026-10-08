# dsh-h3

[![npm 版本][npm-version-src]][npm-version-href]
[![npm 下载量][npm-downloads-src]][npm-downloads-href]
[![许可证][license-src]][license-href]

为 DeepSeek Harness 插件提供 H3 路由服务，通过 Cordis 管理注册与卸载。

## 特性

- **原生 H3**：支持中间件、路由参数、子应用、路由选项和链式调用
- **宿主路由**：支持字符串路径与 `Omit<WebRoute, 'handler'>`，使用 exact/prefix 匹配
- **上下文与选项**：在服务外部或 H3 处理器中读取本次激活的 Context 和选项
- **客户端 API**：通过 GenAPI 静态生成请求函数和类型，不执行宿主代码
- **生命周期清理**：通过 Cordis effect 卸载路由，注册失败时回滚本次改动
- **复用宿主服务**：使用 `ctx.webServer`，保留 gzip，不启动额外服务器、不占用 fallback

> 使用 H3 v2。插件激活前，宿主必须提供 `webServer`。

## 导出入口

| 入口 | 导出 | 用途 |
| --- | --- | --- |
| `dsh-h3` | `defineHostService`、`HostApp`、`HostRoute`、`HostService`、`HostServiceInstance` | 定义宿主路由服务及其类型 |
| `dsh-h3/utils` | `getSeviceContext`、`getSeviceOptions` | 从服务或 H3 事件读取激活数据 |
| `dsh-h3/genapi` | `original` | 接入 GenAPI pipeline，生成客户端 API |

> 工具函数名中的 `Sevice` 为当前公开 API 的拼写。TypeScript 和 GenAPI 仅用于代码生成；不使用该入口时，宿主插件无需安装它们。

## 安装

```sh
pnpm add dsh-h3 h3@^2 @deepseek-ai/cordis @deepseek-ai/dsh-host-webserver
```

## 用法

定义路由服务，在插件的 `apply` 中激活：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineHostService } from 'dsh-h3'
import { defineEventHandler } from 'h3'

const health = defineEventHandler(() => ({ status: 'ok' }))

const service = defineHostService((app) => {
  app.get('/api/health', health)
  app.get({ kind: 'exact', path: '/api/version' }, defineEventHandler(() => ({ version: '1.0.0' })))
  app.get({ kind: 'prefix', path: '/api/inspect' }, defineEventHandler(event => ({
    path: event.url.pathname,
  })))
})

export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => service(ctx), 'custom-label')
}
```

`defineEventHandler` 等 H3 工具直接从 `h3` 导入，`dsh-h3` 不重新导出它们。处理器的返回值由 H3 序列化。

`service(ctx)` 返回卸载函数，也可以手动调用；重复卸载安全。通过 effect 激活时，插件卸载会移除路由。注册失败仅回滚本次激活的路由，不影响已有注册。

### 读取上下文与选项

选项由 `service(ctx, options)` 的第二个参数传入，可以是插件配置或 `apply` 期间创建的依赖：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineHostService } from 'dsh-h3'
import { getSeviceContext, getSeviceOptions } from 'dsh-h3/utils'
import { defineEventHandler } from 'h3'

interface Options {
  startedAt: number
}

const status = defineEventHandler((event) => {
  const ctx = getSeviceContext(event)
  const options = getSeviceOptions<Options>(event)
  return { port: ctx.webServer.port, uptimeMs: Date.now() - options.startedAt }
})

const service = defineHostService<Options>(app => app.get('/api/status', status))

export const inject = ['webServer']

export function apply(ctx: Context): void {
  const options = { startedAt: Date.now() }
  ctx.effect(() => service(ctx, options), 'status:routes')

  getSeviceContext(service) // Context，与传入的 ctx 是同一对象
  getSeviceOptions(service) // 推断为 Options，与传入的 options 是同一对象
}
```

每次激活独立捕获 Context 和选项；同一服务在多个宿主中激活时，事件始终读取自己所属激活的数据，不会被后续激活覆盖。

服务的 `__instance` 指向最近一次成功激活的实例。卸载旧实例不会清除新实例；卸载当前实例会清除该属性，不自动回退到更早的实例。服务尚未激活、当前实例已卸载，或事件不属于本库的服务时，两个工具都会抛出 `TypeError`。

### Node 处理器

路由也接受直接传入的双参数 Node 回调：

```ts
const service = defineHostService((app) => {
  app.get('/api/text', (req, res) => {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(req.method)
  })
})
```

Node 处理器负责结束或流式发送响应。自动识别要求两个显式参数；仅声明 `req`、使用默认参数或 rest 参数时，使用 H3 的 `fromNodeHandler` 显式适配。

## 生成客户端 API

`dsh-h3/genapi` 提供 GenAPI 的 `original` 阶段：读取服务入口中的路由注册，静态解析 H3 处理器，再交给现有 parser、compiler 和输出阶段。不加载插件、不执行宿主代码。

安装生成工具和客户端请求库：

```sh
pnpm add -D @genapi/core@^4.1.4 @genapi/pipeline@^4.1.4 @genapi/presets@^4.1.4 @genapi/shared@^4.1.4 typescript
pnpm add ofetch
```

在 `genapi.config.ts` 中配置：

```ts
import { defineConfig } from '@genapi/core'
import pipeline, { compiler, config, dest, generate } from '@genapi/pipeline'
import { parser } from '@genapi/presets/swag-ofetch-ts'
import { original } from 'dsh-h3/genapi'

export default defineConfig({
  preset: pipeline(config, original, parser, compiler, generate, dest),
  input: './host/routes/index.ts',
  output: {
    main: 'src/client/apis/index.ts',
    type: 'src/client/apis/index.type.ts',
  },
})
```

```sh
pnpm exec genapi
```

输入必须是直接在模块顶层声明 `defineHostService` 的入口文件，而不是路由目录。生成器复用最近的 tsconfig，通过 TypeScript 解析导入的处理器和类型，按声明的路由生成 API，不按文件名猜测 URL；跳过函数工厂内部的服务声明和提前返回后的不可达注册。

- 支持 `app.get/post/...`、`app.on('POST', ...)` 和链式声明；路径接受静态字符串或 exact/prefix 对象。prefix 生成其根端点，不自动枚举子路径。
- `'/api/users/:id'` 生成必填路径参数；对象描述符中的 `:id` 仍按字面量处理。
- `getQuery<Query>(event)` 或 `getQuery(event) as Query` 推导查询字段，`readBody<Body>(event)` 推导对象请求体；返回类型支持推断、导入的类型、可选字段和判别联合。没有具名查询字段时，可通过客户端调用的 `options.params` 传入。
- 函数名由 GenAPI 的 parser 根据方法和完整路径生成，例如 `/api/health` 对应 `getApiHealth`；需要重命名时使用 `patch.operations`。
- 条件、循环、子应用挂载、通配符、复杂路径模式、Node 回调、递归类型及非 JSON 契约暂不支持，遇到不支持的声明会报出源文件位置。读取请求参数需直接放在处理器中；不追踪辅助函数内的请求读取。

生成文件只依赖客户端请求库，不导入宿主模块。默认使用 `ofetch`；可通过 `meta.import.http` 指定同时导出 `ofetch` 和 `FetchOptions` 的客户端模块。客户端选项的 `responseType` 限定为 JSON，以保持返回类型与生成的契约一致。

## 示例

[basic](<examples/basic/README.md>) 是完整的宿主插件项目，按服务入口和独立路由文件组织，包含构建配置、真实 Loader patch 和请求示例。

```sh
pnpm install
pnpm build
pnpm --filter dsh-plugin-h3-basic build

# 需要安装 dsh CLI；从仓库根目录运行。
dsh web --patch ./examples/basic/cordis.patch.yml
```

## API

### `defineHostService<Options>(setup)`

```ts
function defineHostService<Options = undefined>(
  setup: (app: HostApp) => void | HostApp,
): HostService<Options>
```

每次激活创建新的 H3 实例。`setup` 必须同步执行，可以不返回值或返回 app 以支持链式声明。`HostApp` 是增强的 H3，`on`、`all` 和各 HTTP 方法接受字符串或 `HostRoute`、H3/Node 处理器，以及原生路由选项。

返回的服务通过 `service(ctx, options)` 激活，返回卸载函数。未声明选项时沿用 `service(ctx)`；声明了不包含 `undefined` 的选项类型后，第二个参数在类型层面必填。

### `getSeviceContext(service | event)`

从 `dsh-h3/utils` 导入，返回激活时传入的 `Context`。

### `getSeviceOptions<Options>(service | event)`

从 `dsh-h3/utils` 导入，原样返回激活时传入的选项。从 service 读取时自动推断类型；从 event 读取时显式提供选项类型。未传选项的服务返回 `undefined`。

### `original(configRead)`

从 `dsh-h3/genapi` 导入，用在 `config` 与 `parser` 之间，返回填充了路由和类型信息的 GenAPI 配置。实际文件写入仍由 `dest` 完成；配置方式与支持范围见[生成客户端 API](#生成客户端-api)。

### `HostRoute`

```ts
type HostRoute = Omit<WebRoute, 'handler'>
```

| 声明 | 宿主注册 |
| --- | --- |
| `'/api/health'` | exact `/api/health` |
| `'/api/users/:id'` | prefix `/api/users`，由 H3 匹配参数 |
| `'/api/files/**'` | prefix `/api/files`，由 H3 匹配通配符 |
| `{ kind: 'exact', path: '/api/version' }` | 字面量 exact `/api/version` |
| `{ kind: 'prefix', path: '/api/inspect' }` | 匹配 `/api/inspect` 和其子路径，不匹配 `/api/inspection` |

- 对象形式的路径必须是绝对 pathname，不能包含 query、fragment 或尾随斜杠；按字面量处理，不解释为 H3 模式。
- 相同 `(kind, path)` 的不同方法共用一次宿主注册。宿主先选择 exact，再选择最长 prefix；未支持的方法返回带 `Allow` 的 `405`，GET 支持 HEAD。不会因方法不匹配而落入其他宿主路由。
- 不支持 `/:id`、`/**` 等根级模式：使用 `/api/:id` 等静态命名空间，避免占用宿主的单一 fallback。挂载子应用时，其根路径不带尾随斜杠，例如 `/api`。

身份认证、授权和请求体大小限制由插件负责。敏感处理器应先配置适当的 H3 中间件。

## 开发

```sh
pnpm install
pnpm lint
pnpm knip
pnpm test --run
pnpm typecheck
pnpm build
```

测试命令先构建主包和 basic 插件，再验证真实 HTTP 请求、选项与上下文隔离、Cordis 卸载，以及 GenAPI 文件生成、生成代码类型检查和客户端调用。

## 许可证

MIT

<!-- 徽章 -->

[npm-version-src]: https://img.shields.io/npm/v/dsh-h3?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://www.npmjs.com/package/dsh-h3
[npm-downloads-src]: https://img.shields.io/npm/dm/dsh-h3?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://www.npmjs.com/package/dsh-h3
[license-src]: https://img.shields.io/badge/license-MIT-1fa669?style=flat&colorA=080f12
[license-href]: <package.json>
