# GenAPI rules

`dsh-h3/genapi` exports `original`, a GenAPI build stage that statically analyses
the service entry with the TypeScript compiler API. It loads **no** plugin and
executes **no** host code: it reads the source, resolves route declarations, and
emits an OpenAPI-shaped description that the rest of the pipeline turns into
request functions and types.

## Pipeline setup

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

- `original` must run **after** `fetch.ts.config` and **before** the parser; it
  fills `configRead.source` with the OpenAPI document.
- A **type output** is required. Without `output.type`, `original` throws
  `a TypeScript type output is required`.
- `input` must be a **local file**; a URL input throws
  `input must be a local service entry file`.
- The stage reads the nearest `tsconfig.json` (via `ts.findConfigFile`). If none
  is found it falls back to bundled compiler options. It runs with full
  pre-emit diagnostics, so a type error anywhere in the entry **fails
  generation** before any route is collected.

Run it with `pnpm genapi` (or `pnpm exec genapi`). Commit the generated files.

## The entry must be static

`original` scans for a `defineWebServer(...)` call and requires the whole
declaration chain to be statically resolvable.

- `defineWebServer` must be declared **directly at module scope**, either as a
  top-level `const`/`let` variable statement or an `export default` assignment.
  Anything nested in a function, factory, class, or conditional throws
  `services must be declared directly at module scope`.
- The `setup` callback must be a function with a named `app` parameter. `setup`
  may be a block body or a single expression.

### What `setup` may contain

Inside the `setup` body only these statements are understood:

- Expression statements that are direct `app.method(...)` calls.
- `const` declarations whose contents do not reference `app` (checked
  recursively); a non-`const` declaration throws `route bindings must be const`.
- A trailing `return` that either returns `app` or is a chainable
  `app.method(...)` call.
- Empty statements.

Anything else (`if`, loops, `try`, nested functions, `app.mount`, sub-apps)
throws
`conditional, looped and mounted route registration is not supported`.
`app.use` middleware is skipped: it registers no route.

Route declarations are recognised as `app.<method>(route, handler)` with the
receiver chain supported for chaining:

```ts
app.get('/a', a).post('/b', b) // both collected
```

`app.on(method, path, handler, opts?)` is supported; the method must be statically
resolvable. Route options do not add client contract metadata. `app.all`,
`app.connect`, `app.trace`, and `app.query` throw
`declare a specific OpenAPI HTTP method instead of all/connect/trace/query`.

## Paths and parameters

`routeOf` normalises each native H3 string path and extracts path parameters.
A path must start with `/`, must not start with `//`, and must not contain `?`,
`#`, `\`, `'`, `` ` ``, or `$`; otherwise it throws
`route path must be an absolute pathname without query, fragment or code delimiters`.

Supported subset:

- **Static paths** and simple `:parameter` segments **below a static prefix**
  generate client endpoints.
- Each `/:name` (matching `[A-Z_$][\w$]*`, case-insensitively) becomes a required
  path parameter `{ name, in: 'path', required: true, type: 'string' }`. Names
  must be unique.
- Any remaining `:` after substitution throws
  `only simple :parameter segments are supported`.
- A terminal `/**` after a **non-root, fully static prefix** is the only wildcard
  exception. `'/api/inspect/**'` generates only the fixed endpoint
  `/api/inspect`, so `getApiInspect` requests that exact base URL. It does **not**
  accept arbitrary wildcard paths or generate clients for child paths.
- Root `/**`, parameterized prefixes before `/**` (such as
  `/api/users/:id/**`), single-star patterns, interior `**`, and other complex
  patterns remain unsupported. Other patterns starting with `/:` or containing
  `{}*()+` are rejected.

Runtime H3 routing is broader than this client-generation subset. A host prefix
inferred from an H3 pattern does not imply GenAPI support for that pattern.

## Handlers

`handlerOf` resolves the handler expression:

- `defineEventHandler(...)`, `defineHandler(...)`, and `eventHandler(...)` calls
  are unwrapped to their first argument.
- An object form `{ handler: fn, ... }` is unwrapped to its `handler` field.
- The result must be a statically resolvable arrow/function expression or
  function declaration with **fewer than two declared parameters**.
- Node callbacks (two parameters), `fromNodeHandler` wrappers, sub-applications,
  and computed handlers throw
  `use a statically resolvable H3 event handler, not a Node callback or sub-application`.

Nested function bodies are not traversed when looking for contracts: only the
handler's own body is scanned.

## Request contracts

Inside the handler, `getQuery(...)` and `readBody(...)` calls are detected by
name. Each may appear **at most once**; a second occurrence throws
`use one getQuery/readBody contract per handler`.

Types come from, in order of precedence:

1. An explicit type argument: `getQuery<Query>(event)`.
2. The inferred type of the (awaited, non-null) call expression.

`getQuery`:

- Each property becomes a **query** parameter. Optional properties
  (`field?`) are not `required`; the rest are required.
- Each field's type is registered as a reusable definition named after the
  route and the field (for example `GetApiEchochannelQueryPretty`).

`readBody`:

- The body contract must be an **object with named fields**: arrays, tuples,
  primitives, and string-index signatures throw
  `readBody requires an object contract with named fields`.
- An interface named `<Route>Body` is emitted (for example
  `PostApiEchochannelBody`), and a single required `body` parameter references
  it.

## Response contracts

The response type comes from the handler's return type via
`getReturnTypeOfSignature`, unwrapped with `getAwaitedType`, and registered as
`<Route>Response` (for example `PostApiEchochannelResponse`).

- Because only the request generic is typed, a handler declared with
  `defineEventHandler<{ body: T }>` returns `unknown`. To keep a typed response
  pass the response generic too, and for async handlers wrap it in `Promise`:
  `defineEventHandler<{ body: T }, Promise<Result>>(...)`.
- Contracts must be **concrete JSON types**. Type parameters, `bigint`,
  symbols, functions, and class instances are rejected. `Date` is emitted as
  `string`. Recursive types throw `recursive contracts are not supported`.

## Naming

- Definition names are derived from the route's **method and path**, so they stay
  stable when other routes are added or reordered. `GET /api/health` yields
  `GetApiHealthResponse`; `POST /api/echo/:channel` yields
  `PostApiEchochannelResponse` and `PostApiEchochannelBody`; a query field
  appends `Query<Field>`, giving `GetApiEchochannelQueryPretty` for `pretty`.
- Names are normalised exactly the way GenAPI re-derives a `$ref` target: split
  on `-`, `_`, `/`, `.` and on case changes, upper-case the first letter of each
  word, drop everything that is not an ASCII letter or digit, and upper-case the
  first letter of the remaining words again. That second pass is why a `:channel`
  parameter glues to the segment before it (`GetApiEchochannel`, not
  `GetApiEchoChannel`).
- Two routes whose method and path normalise to the same name (for example
  `/api/user-list` and `/api/user/list`) throw
  `generated type name <name> is already used; make the route paths distinguishable`.
- The **client function names** are produced later by the pipeline from the path
  and method (for example `/api/health` + `GET` -> `getApiHealth`). Use
  `patch.operations` to override a name.

## Error reporting

- `original` reports its own errors as `TypeError` with
  `dsh-h3/genapi: <file>:<line>:<column>: <message>` pointing at the offending
  node.
- TypeScript compiler diagnostics are formatted and thrown before collection.
- When no routes are found at all it throws
  `no static defineWebServer routes found in input`.

## Supported / not supported at a glance

| Supported | Not supported |
| --- | --- |
| `app.get/post/put/patch/delete/head/options` | `app.all/connect/trace/query` |
| `app.on('POST', path, handler)` | `app.mount`, `app.use`, sub-apps |
| Chained `app.get(...).post(...)` | `if`/loops/`try`/nested registration |
| Static strings, simple `:param` segments under a static prefix | Root `/:id`, complex regex patterns |
| Static `/api/inspect/**` -> fixed `/api/inspect` only | Root `/**`, parameterized `/**`, single-star or interior `**` patterns |
| `getQuery<T>` / `readBody<T>` contracts | Node callbacks (including `fromNodeHandler`), computed handlers |
| JSON object/array/tuple contracts | Recursive types, functions, classes, `bigint` |
| `Date` -> `string` | `getQuery`/`readBody` used more than once |
