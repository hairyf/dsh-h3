import type { ApiPipeline } from '@genapi/shared'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { original } from '../src/genapi'

function generate(fixture: string): ApiPipeline.ConfigRead {
  const scope: ApiPipeline.GraphSlice = { functions: [], imports: [], variables: [], typings: [], interfaces: [] }
  const uri = fileURLToPath(new URL(`./fixtures/genapi/${fixture}`, import.meta.url))
  const configRead: ApiPipeline.ConfigRead = {
    inputs: { uri },
    config: { input: { uri } },
    graphs: { scopes: { type: scope }, response: {} },
    outputs: [],
  }
  return original(configRead)
}

describe('genapi definitions', () => {
  it('names every definition after the route method and path', () => {
    const scope = generate('routes.ts').graphs.scopes.type
    expect(scope.typings.map(typing => typing.name)).toEqual([
      'GetApiHealthResponse',
      'GetApiUserIDListResponse',
      'GetApiEchochannelResponse',
      'GetApiEchochannelQueryPretty',
      'GetApiEchochannelQueryLimit',
      'PostApiEchochannelResponse',
    ])
    expect(scope.interfaces.map(declaration => declaration.name)).toEqual(['PostApiEchochannelBody'])
    expect(scope.interfaces[0]?.properties).toEqual([{ name: 'message', type: 'string', required: true }])
  })

  it('generates only the base endpoint and preserves the type of a static prefix', () => {
    const configRead = generate('branches-paths.ts')
    expect(Object.keys(configRead.source.paths)).toEqual(['/api/literal-exact', '/api/literal-prefix', '/'])
    expect(configRead.source.paths['/api/literal-prefix'].get).toEqual({
      parameters: [],
      responses: { 200: { description: 'GET /api/literal-prefix', schema: { $ref: '#/definitions/GetApiLiteralPrefixResponse' } } },
    })
    expect(configRead.graphs.scopes.type.typings).toContainEqual({
      name: 'GetApiLiteralPrefixResponse',
      value: '{ "ok": (false | true) }',
      export: true,
    })
  })

  it('rejects routes that normalise to the same name', () => {
    expect(() => generate('ambiguous.ts')).toThrowError('generated type name GetApiUserListResponse is already used; make the route paths distinguishable')
  })
})
