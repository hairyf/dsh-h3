# dsh-h3

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

⚡️ **dsh-h3** is for plugin authors only: it provides [h3](https://github.com/h3js/h3) route services for DeepSeek Harness plugins, with registration and disposal managed by Cordis.

## 📦 Install

```sh
pnpm add dsh-h3 h3
```

<details>
<summary>Are you an AI?</summary>

You can run <code>npx skills add hairyf/dsh-h3 --skill dsh-h3 -y</code> to install the skills!

Remember to ask your owner which <a href="https://github.com/vercel-labs/skills?tab=readme-ov-file#supported-agents">Agents</a> need to be supported (using the <code>--agent</code> parameter of skills) to avoid installing too many default <code>agents</code> directories.

</details>

## Features

- **Native H3**: middleware, route params, sub-apps, route options, and chaining.
- **Host routing**: string paths plus `exact`/`prefix` matching.
- **Context and options**: read the Context and options of the current activation, either outside the service or inside an H3 handler.
- **Lifecycle cleanup**: unregister routes through a Cordis effect, and roll back this activation's changes when registration fails.
- **Reuse the host service**: uses `ctx.webServer`, starts no extra server, and takes no fallback slot.
- **Client API**: statically generate request functions and types with GenAPI, without executing host code.

> ⚠️ Uses H3 v2. The host must provide `webServer` before the plugin activates.

## 📦 Install

```sh
pnpm add dsh-h3 h3
```

## 🚀 Quick start

### 1. Define and activate a route service

Define a route service and activate it in the plugin's `apply` function:

```ts
// src/host/server/routes/health.ts
import { defineEventHandler } from 'h3'

export const health = defineEventHandler(() => ({ status: 'ok' }))
```

```ts
import { defineWebServer } from 'dsh-h3'
// src/host/server/index.ts
import { defineEventHandler } from 'h3'
import { health } from './routes/health'

export const server = defineWebServer((app) => {
  app.get('/api/health', health)
  app.get({ kind: 'exact', path: '/api/version' }, defineEventHandler(() => ({ version: '1.0.0' })))
  app.get({ kind: 'prefix', path: '/api/inspect' }, defineEventHandler(event => ({ path: event.url.pathname })))
})
```

```ts
// src/host/apply.ts
import type { Context } from '@deepseek-ai/cordis'
import { server } from './server'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx), 'custom-label')
}
```

**Notes:**

* Calling `server(ctx)` returns a disposer (safe to call more than once). When activated through `ctx.effect`, the routes are removed automatically when the plugin unloads.
* If registration fails, only the routes from this activation are rolled back; existing routes are left untouched.

---

### 2. Read the context and options

Pass configuration options or runtime dependencies as the second argument to `server(ctx, options)`:

```ts
// src/host/server/index.ts
import { defineWebServer } from 'dsh-h3'
import { status } from './routes/status'

export interface Options {
  startedAt: number
}

export const server = defineWebServer<Options>(app => app.get('/api/status', status))
```

```ts
import type { Options } from '../index'
import { getServerContext, getServerOptions } from 'dsh-h3/utils'
// src/host/server/routes/status.ts
import { defineEventHandler } from 'h3'

export const status = defineEventHandler((event) => {
  const ctx = getServerContext(event)
  const options = getServerOptions<Options>(event)

  return {
    port: ctx.webServer.port,
    uptimeMs: Date.now() - options.startedAt,
  }
})
```

```ts
// src/host/apply.ts
import type { Context } from '@deepseek-ai/cordis'
import { getServerContext, getServerOptions } from 'dsh-h3/utils'
import { server } from './server'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  const options = { startedAt: Date.now() }
  ctx.effect(() => server(ctx, options), 'status:routes')

  // Read the context and options outside the handlers (valid only while the service is active)
  getServerContext(server) // returns the Context that was passed in
  getServerOptions(server) // automatically inferred as Options
}
```

> **Isolation**: each activation captures its own `Context` and options. When the same service is activated in multiple hosts, handlers always keep the data of their own activation and are never overwritten by later activations.

---

### 3. Native Node.js HTTP handlers

The service accepts two-argument Node.js HTTP callbacks directly:

```ts
const server = defineWebServer((app) => {
  app.get('/api/text', (req, res) => {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(req.method)
  })
})
```

> ⚠️ **Tip**: automatic detection requires **two explicitly declared parameters** (such as `req, res`). If you declare only `req`, use default parameters, or use rest parameters (`...args`), wrap the handler explicitly with H3's `fromNodeHandler`.

---

## 🛠️ Generate the client API

`dsh-h3/genapi` provides the `original` build stage for GenAPI. It statically analyses the route definitions and H3 handlers in the service entry, and builds the client API directly, **without loading the plugin or executing host code**.

### 1. Install the dev dependencies

```sh
pnpm add -D @genapi/core @genapi/pipeline @genapi/presets
```

### 2. Configuration file (`genapi.config.ts`)

```ts
import { defineConfig } from '@genapi/core'
import pipeline from '@genapi/pipeline'
import { fetch } from '@genapi/presets'
import { original } from 'dsh-h3/genapi'

export default defineConfig({
  preset: pipeline(
    fetch.ts.config,
    original,
    fetch.ts.parser,
    fetch.ts.compiler,
    fetch.ts.generate,
    fetch.ts.dest
  ),
  input: './src/host/server/index.ts',
  output: {
    main: 'src/client/apis/index.ts',
    type: 'src/client/apis/index.type.ts',
  },
})
```

### 3. Run code generation

```sh
pnpm exec genapi
```

### Rules and limitations

* **Input requirement**: the `input` file must be an entry file that declares `defineWebServer` directly at the top level of the module.
* **Supported syntax**:
  * `app.get/post/...`, `app.on('POST', ...)`, and chaining are supported.
  * Static string paths and `exact`/`prefix` object paths are supported (a `prefix` generates the root endpoint; child paths are not enumerated).
  * `'/api/users/:id'` generates a required path parameter; `:id` inside an object descriptor is treated as a literal.
  * Query/Body types are inferred automatically from `getQuery<Query>(event)` or `readBody<Body>(event)`.
* **Naming**: function names are derived from the path and HTTP method (for example, `/api/health` -> `getApiHealth`). Use `patch.operations` to customize the name.
* **Not supported**: dynamic conditions, loops, mounted sub-apps, wildcards, complex regex patterns, native Node callbacks, recursive types, and non-JSON contracts (unsupported syntax reports the exact source location).

---

## 💡 Example project

The repository ships a complete [basic example](<playground/README.md>) that shows a plugin organised into a service entry and separate route files, its [GenAPI config](<playground/genapi.config.ts>), and the [generated client API](<playground/src/client/apis/index.ts>), together with real host requests and consistency checks.

```sh
# Install and build the example
pnpm install
cd playground
pnpm genapi
pnpm build

# Run it (from the repository root; the dsh CLI must be installed)
dsh web --patch ./cordis.patch.yml
```

---

## 📚 API reference

### `defineWebServer<Options>(setup)`

```ts
function defineWebServer<Options = undefined>(
  setup: (app: HostApp) => void | HostApp,
): HostService<Options>
```

Each activation creates a brand-new H3 instance. The `setup` function must run synchronously. `HostApp` is an enhanced H3 app instance.

### `getServerContext(server | event)`

Imported from `dsh-h3/utils`. Returns the `Context` object passed in for the current activation.

### `getServerOptions<Options>(server | event)`

Imported from `dsh-h3/utils`. Returns the options object passed in for the current activation. Extraction from `server` supports automatic type inference; extraction from an event requires the options type explicitly.

`server.__instance` points to the most recent successfully activated instance. Disposing an older instance does not clear a newer one; after disposing the current instance it does not fall back to an earlier one. When the service is not active, or when an event does not belong to this library, both helpers throw a `TypeError`.

### `original(configRead)`

Imported from `dsh-h3/genapi`. Used inside the GenAPI pipeline to fill in the routes and their type metadata.

### `HostRoute`

```ts
type HostRoute = Omit<WebRoute, 'handler'>
```

| Path declaration | Host-side registration matching |
| --- | --- |
| `'/api/health'` | Exact match (exact) `/api/health` |
| `'/api/users/:id'` | Prefix match (prefix) `/api/users`; params are resolved by H3 |
| `'/api/files/**'` | Prefix match (prefix) `/api/files`; the wildcard is resolved by H3 |
| `{ kind: 'exact', path: '/api/version' }` | Literal exact match `/api/version` |
| `{ kind: 'prefix', path: '/api/inspect' }` | Matches `/api/inspect` and every child path (does not match `/api/inspection`) |

> 🔐 **Security advice**: authentication, authorization, and body size limits are the plugin's own responsibility. Always configure the appropriate H3 middleware for sensitive routes in advance.

---

## 🛠️ Development and contributing

```sh
pnpm install     # install dependencies
pnpm lint        # code style check
pnpm knip        # unused code/dependency check
pnpm test --run  # run unit and integration tests
pnpm typecheck   # TypeScript type check
pnpm build       # build the project
```

---

## 📜️ License

MIT

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/dsh-h3?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/dsh-h3
[npm-downloads-src]: https://img.shields.io/npm/dm/dsh-h3?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/dsh-h3
[bundle-src]: https://img.shields.io/bundlephobia/minzip/dsh-h3?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=dsh-h3
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/dsh-h3
[license-src]: https://img.shields.io/github/license/hairyf/dsh-h3.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/hairyf/dsh-h3/blob/main/LICENSE
