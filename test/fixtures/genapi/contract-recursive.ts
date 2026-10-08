import { defineWebServer } from 'dsh-h3'
import { defineEventHandler } from 'h3'

interface Tree {
  child: Tree | null
}

const handler = defineEventHandler((): Tree => ({ child: null }))

export const server = defineWebServer((app) => {
  app.get('/api/tree', handler)
})
