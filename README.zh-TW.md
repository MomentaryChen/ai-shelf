# AI Shelf

![Terminal 模式 — 建立 Profile、雙開窗格、廣播輸入](docs/assets/zh/terminal-demo.gif)

> 統一工具集：一次檢視、啟動與編排 Claude Code、GitHub Copilot、Cursor 等 AI CLI。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) · [Changelog](CHANGELOG.md)

**v4.1.0** — pnpm monorepo，包含 Electron 桌面應用、輕量清單 CLI（`ai`）與終端機 Profile 管理 CLI（`ai-shelf`）。**Profile** 為桌面與 CLI 共用的主資料模型 — 見 [docs/data-model.md](docs/data-model.md)。

---

## 專案組成

| 元件 | 指令 / 進入點 | 用途 |
|---|---|---|
| **清單 CLI** | `ai` | 掃描模型、技能、MCP、設定；執行 doctor / update / raw |
| **Profile CLI** | `ai-shelf` | 管理 Profile、CLI session、廣播執行；TUI |
| **桌面應用** | `pnpm electron` | Terminal · Inventory · Tools · AI Flow（Electron + React） |

桌面應用與 `ai-shelf` 共用同一 SQLite 資料庫。**Profile Group** 用來分割與整理 **Profile**（名稱、預設值、窗格版面），兩邊資料一致。

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

### 終端機 Profile（`ai-shelf`）

- **Profile Group** — 分割 Profile 的上層分類
- **Profile** — 具名終端機環境（預設目錄、工具、強調色、廣播輸入）；隸屬於 Profile Group，與桌面側欄同一筆資料
- **CLI session** — 可選的無頭 PTY session，隸屬於某 Profile（內部對應 `Profiles` workspace）
- **廣播執行** — `profile exec <名稱> … --broadcast` 對 Profile 內所有執行中的 CLI session 送指令
- **TUI** — Profile 列表 + session 管理（`ai-shelf tui`）
- **舊指令** — `workspace` / `group` / `session` 仍可用但已標示 deprecated

### 桌面應用（Electron）

- **四種模式** — **Terminal**（預設）· **Inventory** · **Tools** · **AI Flow**
- **Terminal** — Profile 側欄、內嵌多窗格 xterm.js + node-pty、廣播輸入、外部啟動
- **Inventory** — Overview · Models · Skills · MCP · Config · Doctor · Update · **Usage**（花費／預算）
- **Tools** — 日常工具：Codec、Crypto、Time、Cron、Regex、JSON、Markdown、YAML ↔ JSON、JWT、UUID、Diff
- **AI Flow** — 撰寫、排程與執行多代理 `.flow.md` 工作流（範本、對話撰寫、執行紀錄）
- **Profile 側欄** — 建立 / 重新命名 / 刪除 Profile；每個 Profile 的分割版面存入 SQLite
- **外部啟動** — Windows 上為 Windows Terminal / PowerShell / CMD；macOS／Linux 依 `$SHELL`（bash / zsh / fish / sh）
- **雲端備份** — 可選 Google 登入備份 Profile（手動同步；見 App 內帳戶設定）
- **獨立視窗** — 可彈出 Chat 與設定視窗
- **主題** — 淺色 / 深色 / 跟隨系統（React + Tailwind CSS v4）

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

![Overview](tests/screenshots/zh/01.overview.png)

在標題列切換 **Terminal**、**Inventory**、**Tools**、**AI Flow**。Inventory 為上圖的分頁儀表板（含 Usage）；Terminal 為內嵌多窗格啟動器與 Profile 側欄；Tools 為本機工具集；AI Flow 為自動化控制台。

→ **[完整頁面介紹（含截圖 · 繁中）](docs/pages.zh-TW.md)** · [English](docs/pages.md)

---

## 安裝

> **一般使用者安裝方式：** 桌面應用提供 **Windows**、**macOS**、**Linux** 套件，見 [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases)。Profile CLI **`ai-shelf`** 已發佈至 [npm](https://www.npmjs.com/package/ai-shelf)。清單 CLI（`ai`）仍須從原始碼建置。

### 桌面應用（建議）

依作業系統從 [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases) 下載對應檔案：

| 平台 | 檔案 | 說明 |
|---|---|---|
| **Windows** | `AI-Shelf-Setup-<version>.exe` | 僅 NSIS 安裝程式（勿用 portable）。SmartScreen 可能警告 — 自簽憑證；請點 **詳細資訊** → **仍要執行**。詳見 [docs/WINDOWS_CODE_SIGNING.md](docs/WINDOWS_CODE_SIGNING.md)。 |
| **macOS** | `AI-Shelf-<version>-arm64.dmg` 或 `-x64.dmg` | 未簽名 — 首次開啟可能需右鍵 → **打開**，或清除隔離屬性（`xattr -dr com.apple.quarantine "/Applications/AI Shelf.app"`）。 |
| **Linux** | `AI-Shelf-<version>.AppImage` | 未簽名 — `chmod +x` 後執行。使用靜態 AppImage runtime（不需 libfuse2）。 |

安裝後包含 Terminal、Inventory、Tools、AI Flow 與內嵌終端機，**不需要**在本機安裝 Node.js。

安裝步驟、解除安裝與 App 內更新見 [docs/RELEASE.md](docs/RELEASE.md)（For users）。維護者發佈流程亦在同一份文件。

### Profile CLI — `ai-shelf`（npm）

```bash
npm install -g ai-shelf
ai-shelf profile list
ai-shelf tui
```

需求：Node.js ≥ 22。與桌面應用裝在同一台機器時，會共用同一份 SQLite Profile 資料庫。多數使用者只需 **桌面安裝版** 即可。

### 清單 CLI — `ai`（從原始碼）

清單 CLI（`ai`）**尚未**發佈至 npm（npm 上的 [`ai`](https://www.npmjs.com/package/ai) 是另一個專案）。請使用桌面應用的 **Inventory** 模式，或依下方步驟從原始碼建置。

### 從原始碼（monorepo）

```bash
git clone <repo-url> ai-shelf
cd ai-shelf
pnpm install          # 會重建原生模組（node-pty、better-sqlite3）
pnpm build
pnpm start            # ai inventory / doctor / …
pnpm exec ai-shelf profile list
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

### Profile CLI — `ai-shelf`

持久化路徑（Windows）：

| 路徑 | 用途 |
|---|---|
| `%APPDATA%/ai-shelf/config.yaml` | 應用設定 |
| `%APPDATA%/ai-shelf/workspaces.db` | SQLite 資料庫（Profile + 版面） |
| `%APPDATA%/ai-shelf/logs/app.log` | 日誌 |

儲存對應說明見 [docs/data-model.zh-TW.md](docs/data-model.zh-TW.md)（[English](docs/data-model.md)）。

```bash
# Profile（主流程 — 與桌面共用）
ai-shelf profile list
ai-shelf profile create <名稱> [--cwd <路徑>] [--tool <工具>] [--color <hex>]
ai-shelf profile update <profile> [--name] [--cwd] [--tool] [--broadcast|--no-broadcast]
ai-shelf profile delete <profile>
ai-shelf profile reorder <profile...>
ai-shelf profile exec <profile> <指令...> [--broadcast] [--session <名稱>]

# 全螢幕 TUI
ai-shelf tui

# 舊版（deprecated）
ai-shelf workspace …
ai-shelf group …
ai-shelf session …
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
pnpm dist:mac                # macOS DMG/ZIP（未簽名；需在 macOS 上執行）→ release/AI-Shelf-<version>-*.dmg
pnpm dist:linux              # Linux AppImage（未簽名；需在 Linux 上執行）→ release/AI-Shelf-<version>.AppImage
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
│   ├── renderer/                 # React UI（Terminal · Inventory · Tools · Flow）
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
| Profile CLI | Commander、better-sqlite3、node-pty、RxJS、Zod、Pino |
| 桌面應用 | Electron 41、React 19、Vite 8、Tailwind CSS 4、xterm.js |
| 測試 | Playwright |

---

## 授權條款

MIT
