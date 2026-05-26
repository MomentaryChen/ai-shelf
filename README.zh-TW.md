# AI Shelf

> 統一工具集：一次檢視、啟動與編排 Claude Code、GitHub Copilot、Cursor 等 AI CLI。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) · [Changelog](CHANGELOG.md)

**v1.4.0** — pnpm monorepo，包含 Electron 桌面應用、輕量清單 CLI（`ai`）與終端機工作區管理 CLI（`ai-shelf`）。

---

## 專案組成

| 元件 | 指令 / 進入點 | 用途 |
|---|---|---|
| **清單 CLI** | `ai` | 掃描模型、技能、MCP、設定；執行 doctor / update / raw |
| **工作區 CLI** | `ai-shelf` | 管理 workspace、group、session；廣播指令；TUI |
| **桌面應用** | `pnpm electron` | 內嵌終端機啟動器 + 清單儀表板（Electron + React） |

桌面應用整合兩者：偵測邏輯在 `src/`，Profile 與版面配置則透過 `packages/cli` 的 SQLite 持久化。

---

## 功能特色

### 清單掃描（`ai`）

- **Overview（總覽）** — 能力矩陣、摘要統計、警告、環境變數狀態
- **Models（模型）** — 依工具顯示模型晶片與能力欄位；長列表可於列內展開（`+N more`）
- **Skills（技能）** — 各工具技能卡片 + 跨工具技能矩陣
- **MCP** — 伺服器清單、同步狀態、跨工具矩陣、**MCP 同步**（將缺少的伺服器複製到其他工具）
- **Config（設定）** — 設定檔 / 指令檔 / MCP 路徑，可點擊開啟
- **Doctor（診斷）** — 並行健康檢查（執行檔、認證、設定 JSON）
- **Update（更新）** — 檢查版本並一鍵更新各工具與本身
- **JSON 輸出** — 所有清單指令支援 `--json`

### 終端機工作區（`ai-shelf`）

- **Workspace 與 Group** — 以 SQLite 組織專案與終端機群組
- **Session** — 建立 / 啟動 / 停止 PTY，可選擇啟動 AI 工具（`claude`、`copilot`、`cursor`、`codex`、`gemini`、`aider`、`opencode`）
- **廣播執行** — 對群組內所有執行中的 session 送出相同指令
- **TUI** — 全螢幕終端機介面（`ai-shelf tui`，neo-blessed）
- **Profile API** — 供桌面應用使用的具名終端機 Profile 函式庫

### 桌面應用（Electron）

- **雙模式** — **Terminal**（預設）與 **Inventory**（7 個分頁：Overview · Models · Skills · MCP · Config · Doctor · Update）
- **Profile 側欄** — 建立 / 重新命名 / 刪除 Profile；每個 Profile 的分割版面存入 SQLite
- **內嵌終端機** — xterm.js + node-pty；多窗格分割、拖曳調整大小；支援窗格間廣播輸入
- **外部啟動** — Windows Terminal、PowerShell 7+、PowerShell 5 或 CMD
- **獨立視窗** — 可彈出 Chat 與設定視窗
- **深色主題** — React + Tailwind CSS v4

---

## 支援工具

| 工具 | 執行檔 | 清單 id |
|---|---|---|
| Claude Code | `claude` | `claude` |
| GitHub Copilot CLI | `copilot` / `gh copilot` | `copilot` |
| Cursor | `agent` | `cursor` |
| OpenAI Codex CLI | `codex` | `codex` |
| Google Gemini CLI | `gemini` | `gemini` |
| Aider | `aider` | `aider` |
| OpenCode | `opencode` | `opencode` |

---

## 桌面應用

![Overview](tests/screenshots/01.overview.png)

在標題列切換 **Terminal** 與 **Inventory**。Inventory 模式為上圖的分頁儀表板；Terminal 模式為內嵌多窗格啟動器與 Profile 側欄。

→ **[完整頁面介紹（含截圖 · 繁中）](docs/pages.zh-TW.md)** · [English](docs/pages.md)

---

## 安裝

### Windows（桌面應用）

1. 至 [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases) 下載 **`AI-Shelf-Setup-<version>.exe`**（僅安裝程式，請勿下載 portable 版）。
2. 執行安裝精靈。若 SmartScreen 提示未知發行者，請點 **詳細資訊** → **仍要執行**（目前未簽章）。
3. 從開始選單或桌面捷徑啟動 **AI Shelf**。

維護者發佈流程與解除安裝說明見 [docs/RELEASE.md](docs/RELEASE.md)。

### 從 npm（清單 CLI）

```bash
npm install -g ai-shelf
pnpm add -g ai-shelf
```

### 從原始碼（monorepo）

```bash
git clone <repo-url> ai-shelf
cd ai-shelf
pnpm install          # 會重建原生模組（node-pty、better-sqlite3）
pnpm build
pnpm start            # ai inventory / doctor / …
pnpm exec ai-shelf workspace list
pnpm electron         # 桌面應用
```

**需求：** Node.js ≥ 22、pnpm ≥ 10

---

## 使用方式

### 清單 CLI — `ai`

```
ai <指令> [子指令] [選項]
```

#### `ai inventory`（縮寫：`ai inv`）

```bash
ai inventory            # 完整總覽表格
ai inventory models     # 模型與上下文資訊
ai inventory skills     # 各工具技能列表
ai inventory mcp        # MCP 伺服器清單
ai inventory config     # 設定檔與指令檔路徑
ai inventory claude     # 單一工具詳細資訊
```

**輸出範例：**

```
  AI Shelf

  TOOL             AUTH   MCP   MODEL                    CTX    STREAM   TOOLS   SKILLS
  ──────────────────────────────────────────────────────────────────────────────────────
  claude           ok     yes   claude-opus-4-5          200k   yes      yes     bash,edit,...
  copilot          ok     yes   gpt-4o                   128k   yes      yes     search,...
  cursor           ok     no    claude-3-5-sonnet          —    yes      yes     —

  MCP Servers: filesystem, github, postgres

  Config Files:
    ~/.claude.json
    ~/.config/gh/config.yml
```

#### `ai doctor`

```bash
ai doctor
ai doctor --json
```

檢查項目：執行檔是否在 `PATH`、認證狀態、設定 JSON 有效性、MCP 設定 JSON 有效性。

#### `ai raw <工具> [參數...]`

```bash
ai raw claude --version
ai raw copilot auth status
```

#### `ai update [目標]`

```bash
ai update              # 所有偵測到的工具 + 本身
ai update claude
ai update copilot
ai update cursor
ai update self
```

#### 全域選項

| 旗標 | 說明 |
|---|---|
| `--json` | 以 JSON 格式輸出 |
| `-h, --help` | 顯示說明 |
| `-v, --version` | 顯示版本 |

---

### 工作區 CLI — `ai-shelf`

持久化路徑（Windows）：

| 路徑 | 用途 |
|---|---|
| `%APPDATA%/ai-shelf/config.yaml` | 應用設定 |
| `%APPDATA%/ai-shelf/workspaces.db` | SQLite 資料庫 |
| `%APPDATA%/ai-shelf/logs/app.log` | 日誌 |

```bash
# Workspace
ai-shelf workspace create <名稱> [--root <路徑>]
ai-shelf workspace list
ai-shelf workspace delete <名稱>

# Group（隸屬於 workspace）
ai-shelf group create <workspace> <group>
ai-shelf group list <workspace>
ai-shelf group delete <workspace> <group>

# Session
ai-shelf session create <workspace> <group> <名稱> [--cwd <路徑>] [--shell <shell>] [--tool <工具>]
ai-shelf session start <workspace> <group> <名稱>
ai-shelf session stop <workspace> <group> <名稱>
ai-shelf session list <workspace> [--group <名稱>]
ai-shelf session exec <workspace> <group> <指令...> [--session <名稱>]
ai-shelf session exec <workspace> <group> <指令...> --broadcast
ai-shelf session delete <workspace> <group> <名稱>

# 全螢幕 TUI
ai-shelf tui
```

套件內部說明見 [`packages/cli/STRUCTURE.md`](packages/cli/STRUCTURE.md)。

---

## 開發

```bash
pnpm install                 # postinstall 會為 Electron 重建原生模組

# TypeScript
pnpm dev                     # 監看根目錄 src/（清單 + electron main）
pnpm dev:cli                 # 監看 packages/cli
pnpm dev:renderer            # Vite 開發伺服器（React UI）

# 建置與執行
pnpm build                   # CLI 套件 + tsc + Vite renderer
pnpm start                   # node dist/cli.js  →  `ai` 指令
pnpm electron                # 建置並啟動桌面應用
pnpm electron:dev            # 已 build 後直接啟動 electron

# 原生模組（Electron 用的 node-pty）
pnpm rebuild:native          # 目前 Electron ABI
pnpm rebuild:native:all      # 所有已安裝的 Electron 版本

# 品質與打包
pnpm test:e2e                # Playwright 截圖測試
pnpm lint
pnpm format / pnpm format:check
pnpm package:win             # 獨立 CLI exe（pkg）
pnpm dist:win                # Windows NSIS 安裝程式 → release/AI-Shelf-Setup-<version>.exe
pnpm dist:win:portable       # 僅開發用 portable（勿提供給使用者）
```

### 專案結構

```
ai-shelf/                 # 根 workspace（Electron + 清單 CLI）
├── src/
│   ├── cli.ts                    # `ai` 進入點 — inventory、doctor、raw、update
│   ├── commands/                 # CLI 指令處理
│   ├── inventory/                # Claude / Copilot / Cursor 偵測器
│   ├── electron/                 # 主程序、preload、workspace-host
│   ├── renderer/                 # React UI（Terminal + Inventory 模式）
│   │   ├── components/           # ChatTab、ProfileSidebar、*Tab 等
│   │   ├── hooks/                # useInventoryScan、useProfileWorkspace 等
│   │   └── terminal/             # 分割樹、版面序列化、SQLite 同步
│   └── utils/
├── packages/cli/                 # `ai-shelf` 工作區管理器
│   └── src/
│       ├── cli/                  # Commander 指令
│       ├── core/                 # ports、entities、errors
│       ├── database/             # SQLite、migrations、repositories
│       ├── services/             # workspace、group、session、profile、exec
│       ├── runtime/              # PTY、process registry、event bus
│       └── tui/                  # neo-blessed 終端機 UI
├── docs/pages.md                 # 桌面 UI 圖文說明（英文）
├── docs/pages.zh-TW.md           # 桌面 UI 圖文說明（繁中）
├── tests/e2e/                    # Playwright 測試
└── scripts/                      # gen-icon、rebuild-native
```

### 技術棧

| 層級 | 技術 |
|---|---|
| 清單 CLI | Node.js、原生 `parseArgs` |
| 工作區 CLI | Commander、better-sqlite3、node-pty、RxJS、Zod、Pino |
| 桌面應用 | Electron 41、React 19、Vite 8、Tailwind CSS 4、xterm.js |
| 測試 | Playwright |

---

## 授權條款

MIT
