import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Vitest runs the data layer in plain Node (no Electron). Aliases mirror
// electron.vite.config.ts so test imports resolve like production code.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(process.cwd(), 'src/shared'),
      '@main': resolve(process.cwd(), 'src/main')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
