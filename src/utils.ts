import type { Context } from '@deepseek-ai/cordis'
import type { H3Event } from 'h3'
import type { HostService, HostServiceInstance } from './index'

export function getSeviceContext<Options>(source: HostService<Options> | H3Event): Context {
  return instanceOf(source).context
}

export function getSeviceOptions<Options>(source: HostService<Options> | H3Event): Options {
  return instanceOf(source).options
}

function instanceOf<Options>(source: HostService<Options> | H3Event): HostServiceInstance<Options> {
  const instance = typeof source === 'function'
    ? source.__instance
    : source?.context?.__dshService as HostServiceInstance<Options> | undefined
  if (!instance)
    throw new TypeError('dsh-h3: service is not active or event does not belong to a host service')
  return instance
}
