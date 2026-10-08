# dsh-h3 API reference

Imports:

- `defineWebServer`, `HostApp`, `HostRoute`, `HostService`, `HostServiceInstance` from `dsh-h3`
- `getServerContext`, `getServerOptions` from `dsh-h3/utils`
- `original` from `dsh-h3/genapi`

## `defineWebServer<Options>(setup)`

```ts
function defineWebServer<Options = undefined>(
  setup: (app: HostApp) => void | HostApp,
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
- `server.__instance` points to the most recent successful activation.
  Disposing an older instance does not clear a newer one, and disposing the
  current instance does not fall back to an earlier one.
- If registration fails partway through, only the routes registered during that
  activation are rolled back; pre-existing routes stay intact.

## `HostApp`

`HostApp` extends the H3 app. Available route registrars:

```ts
app.on(method, route, handler, opts) // method: HTTPMethod | Lowercase<HTTPMethod> | ''
app.all(route, handler, opts)
app.get / app.post / app.put / app.delete / app.patch
app.head / app.options / app.connect / app.trace / app.query
```

Registrars are chainable and share the H3 signatures:

```ts
(route: string | HostRoute, handler: HTTPHandler, opts?: RouteOptions) => this
```

H3 middleware, `app.use`, `app.mount`, route options, and native patterns are
preserved.

### Node.js callbacks

A function with **more than one declared parameter** is wrapped with
`fromNodeHandler` automatically:

```ts
app.get('/api/text', (req, res) => {
  res.end(req.method)
})
```

Declare exactly `(req, res)`. A single parameter, default parameter, or rest
parameter is treated as an H3 handler instead; use `fromNodeHandler` explicitly
in those cases.

## `HostRoute` and path matching

```ts
type HostRoute = Omit<WebRoute, 'handler'>
// { kind: 'exact' | 'prefix', path: string }
```

| Path declaration | Host-side matching |
| --- | --- |
| `'/api/health'` | exact `/api/health` |
| `'/api/users/:id'` | prefix `/api/users` (H3 parses `:id`) |
| `'/api/files/**'` | prefix `/api/files` (H3 parses the wildcard) |
| `{ kind: 'exact', path: '/api/version' }` | literal exact `/api/version` |
| `{ kind: 'prefix', path: '/api/inspect' }` | `/api/inspect` and children, not `/api/inspection` |

Rules and validation:

- A path must be an absolute pathname without a trailing slash, query, fragment,
  backslash, or non-canonical form; otherwise registration throws a `TypeError`.
- Root-level patterns (`/:id`, `/**`, and similar) are rejected; use a static
  prefix for named routes.
- A string path with a param/wildcard becomes a **prefix** host route; the
  handler still receives the full H3 route. Object descriptors are literal.
- The host isolates H3 per route group, so `all`, `HEAD`, and pattern routes
  cannot escape the group's matching rules.
- Method ownership is per group: an unmatched method returns `405` with an
  `allow` header, and `HEAD` falls back to `GET`.
- Registering the same `(kind, path)` twice throws (for example,
  `duplicate exact route`).

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
