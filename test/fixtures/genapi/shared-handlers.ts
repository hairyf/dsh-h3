import { defineEventHandler } from 'h3'

export const namedHandler = defineEventHandler(() => ({ named: true }))

export function functionHandler(): { fromFunction: boolean } {
  return { fromFunction: true }
}

export default defineEventHandler(() => ({ fromDefault: true }))
