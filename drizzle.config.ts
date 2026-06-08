import { defineConfig } from 'drizzle-kit'

// Schema-first migrations: edit src/main/schema.ts, then run `pnpm db:generate`
// to emit SQL into ./drizzle. The app applies pending migrations on startup.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/schema.ts',
  out: './drizzle'
})
