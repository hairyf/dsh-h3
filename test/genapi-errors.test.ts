import type { ApiPipeline } from '@genapi/shared'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { original } from '../src/genapi'

function scope(): ApiPipeline.GraphSlice {
  return { functions: [], imports: [], variables: [], typings: [], interfaces: [] }
}

function read(uri: string, withTypeScope = true): ApiPipeline.ConfigRead {
  const scopes: Record<string, ApiPipeline.GraphSlice> = withTypeScope ? { type: scope() } : {}
  return {
    inputs: { uri },
    config: { input: { uri } },
    graphs: { scopes, response: {} },
    outputs: [],
  }
}

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/genapi/${name}`, import.meta.url))
}

function rejects(name: string, message: RegExp): void {
  expect(() => original(read(fixture(name)))).toThrow(message)
}

function accepts(name: string): ApiPipeline.GraphSlice {
  const configRead = read(fixture(name))
  original(configRead)
  return configRead.graphs.scopes.type
}

describe('genapi input and configuration failures', () => {
  it('rejects a missing service entry uri (src/genapi.ts:57-58)', () => {
    expect(() => original(read(''))).toThrow(/input must be a local service entry file/)
  })

  it('rejects a tsconfig whose root value is not an object (src/genapi.ts:64-65)', () => {
    rejects('config-not-object/entry.ts', /must be an object/)
  })

  it('rejects a tsconfig with an invalid compiler option value (src/genapi.ts:67-68)', () => {
    rejects('bad-option/entry.ts', /TS6046/)
  })

  it('rejects a service entry that cannot be read, without any tsconfig above it (src/genapi.ts:73-74)', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-h3-genapi-'))
    expect(() => original(read(join(directory, 'entry.ts')))).toThrow(/cannot read service entry/)
  })

  it('rejects a service entry with pre-emit diagnostics (src/genapi.ts:76-77)', () => {
    rejects('preemit/entry.ts', /no exported member 'defineWebServer'/)
  })

  it('requires a TypeScript type output (src/genapi.ts:80-81)', () => {
    expect(() => original(read(fixture('routes.ts'), false))).toThrow(/a TypeScript type output is required/)
  })
})

describe('genapi handler and contract failures', () => {
  it('rejects a non-const route binding (src/genapi.ts:113-114)', () => {
    rejects('binding-not-const.ts', /route bindings must be const/)
  })

  it('rejects a route path that is not a static string (src/genapi.ts:126)', () => {
    rejects('path-not-static.ts', /route paths and HTTP methods must be static strings/)
  })

  it('rejects a contract with a bigint response member (src/genapi.ts:136-137)', () => {
    rejects('contract-bigint.ts', /request and response contracts must be concrete JSON types/)
  })

  it('rejects a recursive contract (src/genapi.ts:142-143)', () => {
    rejects('contract-recursive.ts', /recursive contracts are not supported/)
  })

  it('rejects a function member in a contract (src/genapi.ts:149-150)', () => {
    rejects('contract-function.ts', /functions and class instances are not JSON contracts/)
  })

  it('rejects explicit Node handler conversion (src/genapi.ts:193-195)', () => {
    rejects('handler-node-callback.ts', /use a statically resolvable H3 event handler/)
  })

  it('rejects a handler without any call signature (src/genapi.ts:232-233)', () => {
    rejects('handler-not-callable.ts', /handler must be callable/)
  })

  it('rejects two contracts read from one handler (src/genapi.ts:238-239)', () => {
    rejects('request-twice.ts', /use one getQuery\/readBody contract per handler/)
  })

  it('rejects readBody over a string contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-string.ts', /readBody requires an object contract with named fields/)
  })

  it('rejects readBody over an array contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-array.ts', /readBody requires an object contract with named fields/)
  })

  it('rejects readBody over a tuple contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-tuple.ts', /readBody requires an object contract with named fields/)
  })

  it('rejects readBody over an index signature contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-index.ts', /readBody requires an object contract with named fields/)
  })
})

describe('genapi route failures', () => {
  it('rejects a relative route path (src/genapi.ts:200-201)', () => {
    rejects('path-relative.ts', /route path must be an absolute pathname/)
  })

  it('rejects a protocol relative route path (src/genapi.ts:200-201)', () => {
    rejects('path-protocol.ts', /route path must be an absolute pathname/)
  })

  it('rejects a route path with a query delimiter (src/genapi.ts:200-201)', () => {
    rejects('path-delimiter.ts', /route path must be an absolute pathname/)
  })

  it('rejects a brace pattern before URL normalization', () => {
    rejects('path-braces.ts', /only static paths and simple :parameter segments/)
  })

  it.each(['path-wildcard.ts', 'path-wildcard-interior.ts', 'path-wildcard-root.ts', 'path-wildcard-param.ts', 'path-wildcard-trailing.ts'])('rejects an unsupported wildcard route: %s', (name) => {
    rejects(name, /only static paths and simple :parameter segments/)
  })

  it('rejects a duplicated path parameter name (src/genapi.ts:212-213)', () => {
    rejects('path-param-dup.ts', /path parameter names must be unique/)
  })

  it('rejects a malformed path parameter segment (src/genapi.ts:217-218)', () => {
    rejects('path-param-bad.ts', /only simple :parameter segments are supported/)
  })

  it('rejects a method wide route declaration (src/genapi.ts:223-224)', () => {
    rejects('method-all.ts', /declare a specific OpenAPI HTTP method/)
  })

  it('rejects a duplicated method and path declaration (src/genapi.ts:227-228)', () => {
    rejects('duplicate-route.ts', /duplicate GET \/api\/duplicate/)
  })
})

describe('genapi setup failures', () => {
  it('rejects a setup callback without an app parameter (src/genapi.ts:277-278)', () => {
    rejects('setup-no-param.ts', /defineWebServer requires a static setup callback with an app parameter/)
  })

  it('rejects a setup that calls something other than app (src/genapi.ts:284-285)', () => {
    rejects('setup-foreign-call.ts', /setup must use direct app.method\(\.\.\.\) route declarations/)
  })

  it('rejects app.on without all three arguments (src/genapi.ts:293-294)', () => {
    rejects('setup-on-short.ts', /app.on requires method, path and handler/)
  })

  it('rejects a route declaration without both arguments (src/genapi.ts:298-299)', () => {
    rejects('setup-get-short.ts', /route declarations require path and handler/)
  })

  it('rejects a conditional route registration (src/genapi.ts:311-314)', () => {
    rejects('setup-conditional.ts', /conditional, looped and mounted route registration is not supported/)
  })

  it('rejects a non-const binding inside setup (src/genapi.ts:315-316)', () => {
    rejects('setup-let-binding.ts', /route bindings must be const/)
  })

  it('rejects an indirect app use inside a binding (src/genapi.ts:317-322)', () => {
    rejects('setup-indirect.ts', /setup must use direct app.method\(\.\.\.\) route declarations/)
  })

  it('rejects a service declared inside a block (src/genapi.ts:340-345)', () => {
    rejects('setup-nested-module.ts', /services must be declared directly at module scope/)
  })

  it('rejects an input without any defineWebServer route (src/genapi.ts:353-354)', () => {
    rejects('middleware-only.ts', /no static defineWebServer routes found in input/)
  })
})

describe('genapi accepted input branches', () => {
  it('accepts native exact, static prefix and root paths', () => {
    const scope = accepts('branches-paths.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual([
      'GetApiLiteralExactResponse',
      'GetApiLiteralPrefixResponse',
      'GetResponse',
    ])
  })

  it('accepts parenthesized, asserted and object form handlers', () => {
    const scope = accepts('branches-unwrap.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual([
      'GetApiUnwrapParenthesizedResponse',
      'GetApiUnwrapAssertedResponse',
      'GetApiUnwrapSatisfiedResponse',
      'GetApiUnwrapNonNullResponse',
      'GetApiUnwrapTypeAssertionResponse',
      'GetApiUnwrapObjectFormResponse',
    ])
  })

  it('accepts every supported contract shape', () => {
    const scope = accepts('branches-types.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual(['GetApiTypesResponse'])
  })

  it('accepts chained, concise and returning setups', () => {
    const scope = accepts('branches-routing.ts')
    expect(scope.typings.map(typing => typing.name)).toContain('GetApiChainBResponse')
  })

  it('accepts an object contract for readBody and skips nested handlers', () => {
    const scope = accepts('branches-readbody.ts')
    expect(scope.interfaces.map(typing => typing.name)).toEqual(['PostApiReadbodyObjectBody'])
  })

  it('accepts aliased, functional and default exported handlers', () => {
    const scope = accepts('branches-imports.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual([
      'GetApiImportedNamedResponse',
      'GetApiImportedFunctionResponse',
      'GetApiImportedDefaultResponse',
    ])
  })
})
