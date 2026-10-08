import type { ApiPipeline } from '@genapi/shared'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { original } from '../src/genapi'

function generate(fixture: string): ApiPipeline.GraphSlice {
  const scope: ApiPipeline.GraphSlice = { functions: [], imports: [], variables: [], typings: [], interfaces: [] }
  const uri = fileURLToPath(new URL(`./fixtures/genapi/${fixture}`, import.meta.url))
  const configRead: ApiPipeline.ConfigRead = {
    inputs: { uri },
    config: { input: { uri } },
    graphs: { scopes: { type: scope }, response: {} },
    outputs: [],
  }
  original(configRead)
  return scope
}

describe('genapi definitions', () => {
  it('names every definition after the route method and path', () => {
    const scope = generate('routes.ts')
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

  it('rejects routes that normalise to the same name', () => {
    expect(() => generate('ambiguous.ts')).toThrowError('generated type name GetApiUserListResponse is already used; make the route paths distinguishable')
  })
})
