import { defineConfig } from '@genapi/core'
import pipeline, { compiler, config, dest, generate } from '@genapi/pipeline'
import { parser } from '@genapi/presets/swag-ofetch-ts'
import { original } from 'dsh-h3/genapi'

export default defineConfig({
  preset: pipeline(config, original, parser, compiler, generate, dest),
  input: './src/host/server/index.ts',
  output: {
    main: 'src/client/apis/index.ts',
    type: 'src/client/apis/index.type.ts',
  },
})
