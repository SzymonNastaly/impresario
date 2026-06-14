import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Vitest runs under Electron's Node (see the `test` script: ELECTRON_RUN_AS_NODE),
// so the data-layer tests load the same Electron-built better-sqlite3 binary the
// app uses — avoiding the native-module ABI clash between Node and Electron.
// Aliases mirror electron.vite.config.ts so test imports resolve like production.
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
