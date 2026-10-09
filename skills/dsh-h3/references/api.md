# dsh-h3 API reference

Imports:

- `defineWebServer` and the types `HostService`, `HostServiceInstance` from `dsh-h3`
- `H3`, `fromNodeHandler`, and other native H3 utilities/types from `h3`
- `getServerContext`, `getServerOptions` from `dsh-h3/utils`
- `original` from `dsh-h3/genapi`

## `defineWebServer<Options>(setup)`

```ts
import type { H3 } from 'h3'

function defineWebServer<Options = undefined>(
  setup: (app: H3) => void | H3,
): HostService<Options>
```

- Each activation creates a fresh H3 instance; nothing is shared between
  activations.
- `setup` runs synchronously. It must return nothing or the same `app`.
- `setup` throws a `TypeError` if it is not a function, or if it returns a value
  that is neither `undefined` nor `app`.

`HostService<Options>` is the callable service:

```ts
const server = defineWebServer<Options>((app) => { /* ... */ })

// Register routes on the host and get a disposer back.
const dispose = server(ctx, options) // options is required when Options is not undefined
dispose() // safe to call more than once
```

When `Options` is `undefined`, the second argument is optional.

## Activation with Cordis

```ts
export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx, options), 'label')
}
```

- `server(ctx)` requires `ctx.webServer.register`; otherwise it throws
  `dsh-h3: server(ctx) requires the webServer service`.
- The `ctx.effect` disposer removes all routes registered by that activation.
- `server.__host_instance` points to the most recent successful activation.
  Disposing an older instance does not clear a newer one, and disposing the
  current instance does not fall back to an earlier one.
- If registration fails partway through, only the routes registered during that
  activation are rolled back; pre-existing routes stay intact.

## Native H3 routing

`setup` receives the original `H3` instance, without replacing `app.on` or adding
adapter registrar types. Use H3's native string routes and handlers:

```ts
app.on(method, route, handler, opts) // method: HTTPMethod | Lowercase<HTTPMethod> | ''
app.all(route, handler, opts)
app.get / app.post / app.put / app.delete / app.patch
app.head / app.options / app.connect / app.trace / app.query
```

Registrars keep H3's generic handler inference, optional `RouteOptions`, and
chainable `this` return. H3 middleware, `app.use`, `app.mount`, route options,
and native patterns are preserved.

### Node.js callbacks

Convert Node callbacks explicitly with `fromNodeHandler` from `h3`:

```ts
import { fromNodeHandler } from 'h3'

app.get('/api/text', fromNodeHandler((req, res) => {
  res.end(req.method)
}))
```

Raw `(req, res)` callbacks are not converted automatically, regardless of their
parameter count. The explicit wrapper works at runtime, but GenAPI cannot
analyse Node handlers.

## String paths and host matching

The internal adapter infers host matching from native H3 string paths:

| Path declaration | Host-side matching |
| --- | --- |
| `'/api/version'` | exact `/api/version` |
| `'/api/users/:id'` | prefix `/api/users` (H3 parses `:id`) |
| `'/api/inspect/**'` | prefix `/api/inspect` (H3 parses the wildcard) |

Rules and validation:

- The inferred host path must be an absolute, canonical pathname without a
  trailing slash (except `/`), query, fragment, or backslash; otherwise
  registration throws a `TypeError`.
- Root-level patterns (`/:id`, `/**`, and similar) are rejected; use a static
  prefix for named routes.
- Static paths infer **exact** host routes. Dynamic patterns infer a **prefix**
  ending before the first dynamic segment; H3 still matches the full pattern.
  Host prefixes respect segment boundaries: `/api/inspection` does not enter
  the `/api/inspect` group.
- The host isolates H3 per route group, so `all`, `HEAD`, and pattern routes
  cannot escape the group's matching rules.
- Method ownership is per group: an unmatched method returns `405` with an
  `allow` header, and `HEAD` falls back to `GET`.
- Registering an already-owned host `(kind, path)` throws (for example,
  `duplicate exact route`). Multiple H3 routes with the same inferred host key
  within one activation share a group.

## `getServerContext` / `getServerOptions`

```ts
import { getServerContext, getServerOptions } from 'dsh-h3/utils'

getServerContext(service) // Context
getServerContext(event) // Context
getServerOptions(service) // Options (inferred)
getServerOptions<Options>(event)
```

- Accept either the service instance or an H3 event belonging to this library.
- Outside a request, read them while the service is active; when read from the
  service instance, `getServerOptions` infers the options type.
- Both throw a `TypeError` when the service is inactive
  (`service is not active`) or the event does not belong to this library
  (`event does not belong`).
- Each activation captures its own `Context` and options, so multiple
  activations in different hosts never leak into each other.
