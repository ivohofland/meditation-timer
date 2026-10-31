import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        tune: resolve(import.meta.dirname, 'tune.html'),
      },
    },
  },
  test: { globals: true },
})
