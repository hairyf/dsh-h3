// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    antislop: true,
    ignores: ['README.md', 'examples/basic/src/client/apis/**'],
  },
)
