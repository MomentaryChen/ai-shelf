# AI CLI Inventory

> 統一的 CLI 工具，可一次瀏覽 Claude、GitHub Copilot、Cursor 的模型、技能、MCP 伺服器與設定檔。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md)

---

## 功能特色

- **Overview（總覽）** — 摘要統計、能力矩陣、警告清單與環境變數存在狀態，一目了然
- **Models（模型）** — 透過原生 CLI 列出每個工具的可用模型，點擊即可切換預設模型，超過 10 個可展開顯示
- **Skills（技能）** — 各工具技能卡片 + 跨工具技能矩陣
- **MCP** — 完整 MCP 伺服器清單、同步狀態與跨工具矩陣
- **Config（設定）** — 列出每個工具的設定檔、指令檔與 MCP 路徑，可點擊開啟
- **Doctor（診斷）** — 並行健康檢查（執行檔、認證、設定 JSON），以即時卡片呈現
- **Update（更新）** — 透過原生 CLI 檢查版本並一鍵更新各工具與本身
- **Chat（終端機）** — 內嵌終端機（xterm.js + node-pty），可直接在應用程式中啟動任何 AI 工具；支援多窗格分割檢視（可拖曳調整大小），或開啟外部終端機（Windows Terminal、PowerShell、CMD）
- **JSON 輸出** — 每個 CLI 指令皆支援機器可讀的 JSON 格式
- **Electron 桌面應用** — 可選的深色主題視覺化桌面介面

## 支援工具

| 工具 | 執行檔 |
|---|---|
| Claude Code | `claude` |
| GitHub Copilot CLI | `gh copilot` |
| Cursor | `agent` |

---

## 桌面應用

![Overview](tests/screenshots/01.overview.png)

桌面應用共有 8 個頁籤：**Overview · Chat · Models · Skills · MCP · Config · Doctor · Update**。  
→ **[完整頁面介紹（含截圖）](docs/pages.md)**

---

## 安裝

```bash
# npm
npm install -g ai-cli-inventory

# pnpm
pnpm add -g ai-cli-inventory

# yarn
yarn global add ai-cli-inventory
```

---

## 使用方式

```
ai <指令> [子指令] [選項]
```

### `ai inventory`（縮寫：`ai inv`）

顯示所有偵測到的 AI 工具能力矩陣。

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
  AI CLI Inventory

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

### `ai doctor`

對每個偵測到的工具執行健康檢查。

```bash
ai doctor
ai doctor --json
```

檢查項目：

- 執行檔是否在 `PATH` 中
- 認證狀態（`ok` / `missing` / `expired` / `unknown`）
- 設定 JSON 格式是否有效
- MCP 設定 JSON 格式是否有效

### `ai raw <工具> [參數...]`

直接將參數轉發給底層 CLI 執行檔。

```bash
ai raw claude --version
ai raw copilot auth status
```

### `ai update [目標]`

更新 AI 工具或清單工具本身。

```bash
ai update              # 更新所有偵測到的工具 + 本身
ai update claude       # 只更新 Claude Code
ai update copilot      # 只更新 GitHub Copilot CLI
ai update cursor       # 只更新 Cursor
ai update self         # 只更新 ai-cli-inventory
```

### 全域選項

| 旗標 | 說明 |
|---|---|
| `--json` | 以 JSON 格式輸出 |
| `-h, --help` | 顯示說明 |
| `-v, --version` | 顯示版本 |

---

## 開發

**需求環境：** Node.js ≥ 22、pnpm

```bash
# 安裝相依套件
pnpm install

# TypeScript 監看模式
pnpm dev

# 建置
pnpm build

# 從建置執行 CLI
pnpm start

# 啟動 Electron 桌面應用
pnpm electron

# 打包成 Windows 獨立執行檔
pnpm package:win

# 建置 Windows 安裝程式（electron-builder）
pnpm dist:win
```

### 專案結構

```
src/
├── cli.ts              # CLI 進入點與參數解析
├── commands/
│   ├── inventory.ts    # inventory 指令
│   ├── doctor.ts       # doctor 指令
│   ├── raw.ts          # raw 直通指令
│   └── update.ts       # update 指令
├── inventory/
│   ├── index.ts        # detectAll() — 執行所有偵測器
│   ├── claude.ts       # Claude 偵測器
│   ├── copilot.ts      # Copilot 偵測器
│   ├── cursor.ts       # Cursor 偵測器
│   └── types.ts        # 共用型別（ProviderEntry 等）
├── electron/           # Electron 主程序 + preload
├── renderer/           # React + Tailwind 桌面 UI
│   └── components/
│       ├── ChatTab.tsx          # 內嵌終端機啟動器
│       ├── EmbeddedTerminal.tsx # xterm.js 終端機窗格
│       └── ...                  # OverviewTab、ModelsTab 等
└── utils/              # exec、設定檔輔助工具
```

---

## 授權條款

MIT
