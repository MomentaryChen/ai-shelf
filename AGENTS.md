# AGENTS.md

## Cursor Cloud specific instructions

### Overview

AI Shelf is a pnpm monorepo with two workspaces:
- **Root** (`/workspace`): Electron desktop app + Inventory CLI (`ai`)
- **`packages/cli`**: Profile CLI (`ai-shelf`) using Commander, better-sqlite3, node-pty

### Prerequisites

- Node.js >= 22, pnpm >= 10.12.1 (specified in `packageManager` field)
- C++ build tools for native modules (node-gyp)

### Dev commands (see README.md "Development" section for full list)

| Task | Command |
|------|---------|
| Install deps | `pnpm install` (runs `postinstall` → rebuilds native modules for Electron) |
| Build all | `pnpm build` (tsup CLI + tsc main + Vite renderer) |
| Watch main process | `pnpm dev` (tsc --watch) |
| Watch renderer | `pnpm dev:renderer` (Vite at localhost:5173) |
| Watch CLI package | `pnpm dev:cli` (tsx watch) |
| Lint | `pnpm lint` (recursive ESLint across workspaces) |
| Format check | `pnpm format:check` (Prettier) |
| Run Electron | `pnpm electron` (builds first) or `pnpm electron:dev` (skips build) |
| E2E tests | `pnpm test:e2e` (Playwright + Electron; requires display server) |
| Docs screenshots | `pnpm gen:docs-assets` (Windows + ffmpeg; before release — see `docs/RELEASE.md`) |

### Non-obvious caveats

1. **Native module ABI mismatch**: `postinstall` rebuilds `better-sqlite3` and `node-pty` for **Electron's** ABI (NODE_MODULE_VERSION 145). Running `packages/cli` directly via Node.js (e.g. `node packages/cli/dist/cli.js profile list`) will fail with `ERR_DLOPEN_FAILED` because Node.js uses a different ABI (127). The profile CLI is designed to run inside the Electron process.

2. **E2E tests require a display server**: On headless Linux, use `xvfb-run --auto-servernum pnpm exec playwright test`. The tests launch Electron, navigate tabs, and take screenshots.

3. **Docs screenshot workspace**: `tests/e2e/screenshot.spec.ts` and `terminal-demo-gif.spec.ts` set `AISHELF_APP_DATA_DIR` to an isolated folder and seed a **Demo** profile group — not the developer's real `%APPDATA%/ai-shelf` data.

4. **E2E test locale dependency**: The screenshot test asserts Chinese-language text (e.g. "已安裝 / 偵測總數"). Locale is pinned via `AISHELF_DOCS_LOCALE=zh` in docs helpers.

5. **Inventory CLI works standalone**: `node dist/cli.js` (after build) runs the `ai` inventory commands without native module issues — it does not use `better-sqlite3`.

6. **`pnpm.onlyBuiltDependencies`** in `pnpm-workspace.yaml` handles native build approvals non-interactively — no need for `pnpm approve-builds`.
