import { defineEventHandler, getQuery, getRouterParam, readBody } from 'h3'

interface EchoQuery {
  pretty?: boolean
  limit?: number
}

interface EchoBody {
  message: string
  tags?: string[]
  metadata?: Record<string, string>
}

interface EchoResult {
  channel: string
  method: string
  pretty: boolean
  limit: number
  body: EchoBody
  query: EchoQuery
}

export const readEcho = defineEventHandler((event) => {
  const query = getQuery<EchoQuery>(event)
  return {
    channel: getRouterParam(event, 'channel') ?? '',
    method: event.req.method,
    pretty: query.pretty ?? false,
    limit: query.limit ?? 10,
    query,
  }
})

export const writeEcho = defineEventHandler<{ body: EchoBody }, Promise<EchoResult>>(async (event) => {
  const body = await readBody(event)
  const query = getQuery<EchoQuery>(event)
  return {
    channel: getRouterParam(event, 'channel') ?? '',
    method: event.req.method,
    pretty: query.pretty ?? false,
    limit: query.limit ?? 10,
    body: body ?? { message: '' },
    query,
  }
})
