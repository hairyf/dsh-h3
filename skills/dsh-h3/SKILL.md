---
name: dsh-h3
description: Build host-only HTTP route services for DeepSeek Harness (DSH) plugins with dsh-h3, an H3 v2 integration managed by Cordis. Use when creating or editing a DSH plugin that registers routes on ctx.webServer with defineWebServer, when reading the activation Context/options in handlers, when using native H3 string paths, parameters, or wildcards, or when generating a typed client API with dsh-h3/genapi.
license: MIT
compatibility: Requires Node.js and pnpm. Depends on H3 v2 and @deepseek-ai/dsh-host-webserver; the host must provide the webServer service before the plugin activates.
metadata:
  author: hairyf
  version: "0.0.0"
---

# dsh-h3

`dsh-h3` lets a DeepSeek Harness plugin register H3 routes on the host's existing
web server. It does **not** start its own server, occupy a port, or claim the
fallback slot: every route lives on `ctx.webServer`, and Cordis manages
registration and disposal.

## When to use this skill

- Create or modify a DSH plugin that serves HTTP routes.
- Define routes with `defineWebServer` and activate them with `ctx.effect`.
- Read the active `Context` or options from a handler or from the service.
- Use native H3 string paths, path parameters, or wildcard routes.
- Generate the typed client API with `dsh-h3/genapi`.

Do **not** use this skill for a standalone H3/Nitro server. `dsh-h3` always
registers onto a host-provided `webServer`.

## Mental model

- `defineWebServer<Options>(setup)` returns a `HostService<Options>`.
- Calling the service (`server(ctx, options)`) registers routes and returns a
  disposer. Activate it with `ctx.effect(() => server(ctx, options), 'label')`.
- The plugin must declare `inject = ['webServer']` so it activates only after
  the host is ready.
- `setup` has signature `(app: H3) => void | H3` and must be synchronous,
  returning nothing or the supplied app. It receives the native H3 instance;
  `app.on` is not replaced. Use H3 string paths, handler types, route options,
  `app.get/post/put/patch/delete/...`, `app.on(method, ...)`, `app.use`, `app.mount`,
  and chaining.

## Quick start

```ts
// src/host/server/routes/health.ts
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ status: 'ok' }))
```

```ts
// src/host/server/index.ts
import { defineWebServer } from 'dsh-h3'
import health from './routes/health'

export interface ServerOptions {
  startedAt: number
}

export const server = defineWebServer<ServerOptions>((app) => {
  app.get('/api/health', health)
  app.get('/api/version', () => ({ version: '1.0.0' }))
  app.get('/api/inspect/**', event => ({ path: event.url.pathname }))
})
```

```ts
// src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { server } from './host/server'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx, { startedAt: Date.now() }), 'h3-basic:routes')
}
```

## Route declarations

| Declaration | Host matching |
| --- | --- |
| `app.get('/api/version', handler)` | exact `/api/version` |
| `app.get('/api/users/:id', handler)` | prefix `/api/users`; H3 parses `:id` |
| `app.get('/api/inspect/**', handler)` | prefix `/api/inspect`; H3 parses the wildcard |

Key rules:

- Register routes with **native H3 strings only**. Static paths infer **exact**
  host routes; dynamic patterns infer a **prefix** ending before the first
  dynamic segment. H3 still performs the actual route match.
- Root-level patterns such as `/:id` and `/**` are rejected; use a static prefix.
  Host prefixes respect segment boundaries (`/api/inspection` is outside
  `/api/inspect`).
- Read path params with H3's `getRouterParam(event, 'id')`.
- Methods are owned per host group: an unmatched method on a matched path
  returns `405` with an `allow` header; `HEAD` falls back to `GET`. `all`, `HEAD`,
  and pattern routes cannot escape their group.
- Registering an already-owned host `(kind, path)` throws, and a failed
  activation rolls back only its own routes.

## Read the Context and options

Import from `dsh-h3/utils`. `getServerContext` / `getServerOptions` accept either
the service instance (outside a request) or an H3 event (inside a handler).

```ts
import { getServerContext, getServerOptions } from 'dsh-h3/utils'

export default defineEventHandler((event) => {
  const ctx = getServerContext(event) // Context of this activation
  const { startedAt } = getServerOptions<ServerOptions>(event)
  return { port: ctx.webServer.port, uptimeMs: Date.now() - startedAt }
})
```

When read from the service instance, `getServerOptions` infers the type
automatically. When read from an event, pass the options type explicitly. Both
throw a `TypeError` if the service is inactive or the event is not from this
library.

## Typed request contracts

Declare request types on the handler generic so H3 types `readBody`/`getQuery`:

```ts
import { defineEventHandler, readBody } from 'h3'

interface EchoBody { message: string, tags?: string[] }

// Body typed via the handler generic; `readBody` returns `EchoBody | undefined`.
export default defineEventHandler<{ body: EchoBody }>(async (event) => {
  const body = await readBody(event)
  return { message: body?.message ?? '' }
})
```

- Supplying only the request generic makes H3 default the **response** generic to
  `unknown`. To keep a typed response, pass it too: for an async handler use
  `defineEventHandler<{ body: EchoBody }, Promise<Result>>(...)`.
- `EventHandlerRequest['query']` is constrained to a string map; for richer query
  types use an explicit `getQuery<QueryType>(event)`.
- `dsh-h3/genapi` discovers contracts from the `getQuery` / `readBody` calls, so
  call them directly inside the handler (at most one of each).

## Node.js callbacks

Convert Node callbacks explicitly with H3's `fromNodeHandler`:

```ts
import { fromNodeHandler } from 'h3'

app.get('/api/text', fromNodeHandler((req, res) => {
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end(req.method)
}))
```

There is no parameter-count-based automatic conversion. Handlers wrapped with
`fromNodeHandler` work at runtime, but GenAPI cannot analyse Node callbacks or
their wrappers.

## Generate the client API

`dsh-h3/genapi` exports `original`, a GenAPI pipeline stage that statically
analyses the service entry (no plugin loaded, no host code executed) and emits
request functions plus response/query/body types.

```ts
// genapi.config.ts
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
    fetch.ts.dest,
  ),
  input: './src/host/server/index.ts',
  output: {
    main: 'src/client/apis/index.ts',
    type: 'src/client/apis/index.type.ts',
  },
})
```

Run `pnpm genapi`. See [references/genapi.md](references/genapi.md) for the full
rule set and limitations.

> **Keep the input GenAPI-friendly**: declare `defineWebServer` directly at module
> scope, keep `setup` synchronous, and register routes with direct
> `app.method(...)` calls. Use static strings or simple `:parameter` segments below
> a static prefix. A terminal `/**` after a non-root, fully static prefix is the
> only wildcard exception: `/api/inspect/**` generates only the fixed endpoint
> `/api/inspect`, not a wildcard or child-path client. Root `/**`, parameterized
> prefixes before `/**`, other wildcard forms, conditionals, loops, and mounted
> sub-apps are unsupported.

## Common pitfalls

- `setup` must be synchronous and return nothing or the app; it may not perform
  conditional, looped, or mounted registration if you rely on GenAPI.
- Forgetting `inject = ['webServer']` activates the plugin before the host can
  serve routes.
- Using `app.mount` or non-H3 sub-apps works at runtime but produces no client
  API.
- Registering an already-owned host `(kind, path)` throws `duplicate ... route`.
- Do not start an extra server or bind a port; always reuse `ctx.webServer`.

## Verify your work

```sh
pnpm typecheck   # types
pnpm lint        # style
pnpm test --run  # unit + integration
pnpm build       # build
```

Then, for a plugin that generates a client, run `pnpm genapi` and commit the
generated files.

## References

- [API reference](<references/api.md>): `defineWebServer`, native H3 routing, utils, and host matching.
- [GenAPI rules](references/genapi.md): pipeline setup, naming, and supported/unsupported syntax.
