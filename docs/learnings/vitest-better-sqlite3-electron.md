# Running Vitest against better-sqlite3 in an Electron app

`better-sqlite3` is a native module compiled for one Node ABI at a time. This app
runs on Electron (ABI 140 for Electron 39), and `postinstall`
(`electron-builder install-app-deps`) builds the binary for Electron. Plain
system Node (e.g. v22 = ABI 127) cannot load that same binary, and vice versa —
there is a single `build/Release/better_sqlite3.node`, no multi-ABI prebuilds.

So `vitest run` under plain Node fails on `new Database()` with
`NODE_MODULE_VERSION 140 ... requires 127`, while rebuilding for Node
(`pnpm rebuild better-sqlite3`) silently breaks the Electron app.

## Fix

Run Vitest **under Electron's own Node** so tests share the Electron-built
binary the app uses — no rebuild, both work:

```json
"test": "cross-env ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run"
```

`cross-env` keeps the env-var syntax portable across platforms. Keep
better-sqlite3 built for Electron (the default `postinstall`); never
`pnpm rebuild` it for system Node.

If the binary ever ends up built for the wrong runtime, force the Electron build:

```bash
npx @electron/rebuild -f -w better-sqlite3 --build-from-source
```
