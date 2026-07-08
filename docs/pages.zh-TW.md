# UI 頁面 — 詳細說明

> AI Shelf 桌面應用的分頁／模式導覽（與截圖對應）。  
> 返回 [README（中文）](../README.zh-TW.md) · [English README](../README.md) · [English page guide](pages.md)

---

## 目次

- [應用程式導覽](#應用程式導覽)
1. [總覽](#1-總覽)
2. [Terminal 模式](#2-terminal-模式)
3. [模型](#3-模型)
4. [技能](#4-技能)
5. [MCP 伺服器](#5-mcp-伺服器)
6. [設定檔](#6-設定檔)
7. [診斷](#7-診斷)
8. [更新](#8-更新)

---

## 應用程式導覽

桌面應用有兩種頂層模式（標題列以 **Terminal** / **Inventory** 分頁切換）：

- **Terminal**（預設）：基於 Profile 的工作區，內嵌多窗格終端機，可選擇在外部終端機啟動工具
- **Inventory**：儀表板，子分頁為 Overview、Models、Skills、MCP、Config、Doctor、Update（標籤文案多為英文，與 UI 一致）

隨時可用標題列在兩種模式間切換。

### Inventory 頁尾

在 **Inventory** 模式時，視窗底部有 **🔄 Refresh**，會重新執行偵測並刷新各分頁資料。

---

## 1. 總覽

![Overview](../tests/screenshots/01.overview.png)

**Overview** 是清單儀表板首頁，列出 App 認得的每套 AI CLI（不論是否已安裝）。介面為中英混合：統計數字區塊多為中文標籤，下方表格欄位標題為英文。

### 統計列（Summary）

| 區塊 | 意義 |
|---|---|
| **已安裝 / 偵測總數** | 已出現在 `PATH` 的工具數量 / 掃描到的工具總數 |
| **未安裝** | 有列在清單中但二進位不在 `PATH` 的工具數量 |
| **MCP Servers** | 由**已安裝**工具回報的 MCP 伺服器之**不重複**數量 |
| **Warnings** | 未安裝，或已安裝但認證為 `missing` 的筆數 |

### 能力表格

主表每列一個工具，欄位：

| 欄位 | 說明 |
|---|---|
| **Tool** | 工具名稱與官方圖示 |
| **Version** | CLI `--version`（未安裝顯示 —） |
| **Auth** | `ok` · `missing` · `expired` · `unknown` |
| **MCP** | 是否偵測到 MCP 設定（`Yes` / `No`） |
| **Model** | 目前預設模型 |
| **Context** | 推斷的上下文長度 |
| **Stream** | 是否支援串流輸出 |
| **Tools** | 是否支援工具／函式呼叫 |
| **Skills** | 已偵測的技能標籤 |

### Warnings 區塊

列出需要處理的項目（例如未在 `PATH` 找到、尚未設定認證）；部分提示為英文句子。

### 環境變數（🔑 Environment）

依工具供應商分組，顯示相關環境變數是否已設定（**不**顯示實際值；若可讀取，可於按鈕上點開檢視）。

---

## 2. Terminal 模式

![Terminal](../tests/screenshots/02.terminal.png)

**Terminal** 模式是 Profile 化工作區：Profile 與版面存於 SQLite、內嵌 **node-pty** 工作階段、可開啟獨立的 **Terminal Settings** 視窗調整共用偏好。

### Profile 側欄

- 建立、重新命名、刪除與排序 Profile
- 點選齒輪開啟 **Profile 設定**：顯示名稱、**預設工作目錄**（含資料夾挑選）、**預設啟動工具**、**同步輸入至所有 terminal**（廣播輸入至多個窗格）、主題強調色
- 側欄底部的 **Settings** 會開啟 **Terminal Settings** 視窗（見下文）

### Terminal Settings 視窗

由側欄 **Settings** 開啟（視窗標題 **Terminal Settings**），內容對應 `ChatSettingsPanel`：

| 區塊 | 說明 |
|---|---|
| **Working directory** | 下拉選單含 `~ (home directory)` 與最近路徑；**Browse…** 挑選資料夾；最多記住 **10** 筆；**Clear history** 清空列表 |
| **External terminal preference** | 與主畫面上外部終端機選項相同，以按鈕群組呈現 |
| **Terminal background** | 背景預設組（Windows Terminal、App theme、Pure black、PowerShell blue、VS Code）與自訂色碼 |

### 工具列（已選擇 Profile 時）

| 控制項 | 說明 |
|---|---|
| **+ Pane** | 選單中挑選工具，新增內嵌窗格（達上限時會停用，Profile 徽章顯示 `目前/上限`） |
| **外部終端機下拉選單** | 選項等同 **External terminal preference**（Auto detect、Windows Terminal、PowerShell 7+、PowerShell 5、CMD） |
| **`· sync` 字樣** | 開啟廣播且窗格數 > 1 時，Profile 徽章會在計數旁顯示 **`· sync`** |

### 「可用的 Agent」卡片格

區塊標題為 **可用的 Agent**，列出已安裝工具。每張卡含版本、認證狀態、簡短說明，以及：

- **🖥️ External** — 以目前偏好的外部終端機啟動該 CLI
- **⌨️ In-App** — 在應用程式內以 **xterm.js** + **node-pty** 開啟窗格

### 內嵌終端機窗格

- 支援分割樹狀版面，可拖曳分隔線調整比例
- 焦點窗格接收鍵盤輸入；啟用廣播時，輸入會送到**所有**窗格
- 還原 Profile 時會盡力恢復上次版面與工作階段

### 窗格快捷鍵（Terminal 模式、有開啟窗格時）

在文字輸入框（例如 Profile 重新命名）內不會觸發。

| 快捷鍵 | 動作 |
|---|---|
| **Ctrl+Tab** | 回到上一個使用的終端機（跨 Profile／工作區） |
| **Ctrl+Shift+Tab** | 上一個窗格 |
| **Ctrl+1 … Ctrl+9** | 跳到第 N 個窗格（依版面樹順序） |
| **Ctrl+W** | 關閉目前焦點窗格 |
| **Ctrl+\\** | 向右分割（水平） |
| **Ctrl+Shift+\\** | 向下分割（垂直） |

---

## 3. 模型

![Models](../tests/screenshots/03.models.png)

**Models** 分頁以唯讀方式呈現各工具的預設模型、可擴充的模型清單與能力旗標。偵測尚未完成時，標題列可能顯示 **loading models…**。

### 區塊

- **已安裝** — `PATH` 上可用的工具
- **未安裝** — 清單內尚未安裝者，並在可能時顯示安裝指令提示

### 模型表

| 欄位 | 說明 |
|---|---|
| **Tool** | 工具名稱與圖示 |
| **Available Models** | 以晶片顯示預設模型與擴充名單；若無清單則常顯示 `default` |
| **Context** | 由清單邏輯格式化的上下文／權杖資訊 |
| **Streaming / Tool Calls / Vision** | 能力開關（`Yes` / `No`） |

### 長列表

單一工具超過 **10** 個模型晶片時，會出現 **`+N more`**／**Show less**，每個工具各自的展開狀態互不影響。

### 資料從哪裡來

Quick scan 會先回傳基本資料，再在背景 enrich。例：**Cursor** 可透過 **`agent --list-models`** 帶出名稱列表；部分供應商在偵測到 API / Token 時也會改用 HTTP API 回填模型列表，因此實際內容可能隨環境憑證而變，不一定等同單一固定 CLI 指令輸出。

---

## 4. 技能

![Skills](../tests/screenshots/04.skills.png)

**Skills** 分頁顯示各工具回報的技能。

### 各工具卡片

每個工具一張卡：圖示、名稱、技能數量徽章，以及技能標籤（例如 `bash`、`file-edit`、`mcp` 等）。

### 技能矩陣

頁尾以矩陣比對：列為技能、欄為工具，✓ 表示支援。

---

## 5. MCP 伺服器

![MCP](../tests/screenshots/05.mcp.png)

**MCP** 分頁整理 MCP 伺服器組態與跨工具對照。

### 摘要區

若有資料，會出現統計瓷磚：**Unique MCP Servers（已安裝工具）**，表示僅統計已安裝工具所回報的 MCP 伺服器名稱（去重後）。

### 各工具卡片

- 標題列顯示 **Supported**／**Not Supported** 或未安裝狀態
- CLI 未安裝時顯示：**未安裝，無法掃描 MCP 設定**
- 已設定時以 **🔌** 標籤列出伺服器名稱；mono 路徑可點擊並由系統檔案總管開啟所在位置（與 Overview 類似）

### MCP Server Matrix

在同一張矩陣卡中對照：**Server**（列）、各支援同步的工具（欄）。

### MCP 同步（Sync）

在同一矩陣卡內可操作 JSON MCP 項目複製／補齊：

- **Sync to:** 勾選寫入目標（程式內對應 `claude`、`copilot`、`cursor`、`codex`、`gemini`、`opencode`）
- Codex 寫入 `~/.codex/config.toml` 的 `[mcp_servers.*]`；Aider 不支援 MCP。新工具建議優先使用 JSON MCP 設定以降低同步成本。
- **Sync Selected (`n`)** — 僅對第一欄勾選的伺服器套用
- **Sync All Missing (`n`)** — 對所有仍需補齊的列一次套用
- 執行中按鈕顯示 **Syncing…**，完成後可依工具列出 `added`、`skipped` 或錯誤訊息
- 已全面配置之列會以較淡樣式顯示；矩陣底部註腳統計總伺服器數、**need sync**、**fully synced**

---

## 6. 設定檔

![Config](../tests/screenshots/06.config.png)

**Config** 分頁依類型列出各工具用到的檔案路徑。

### 類型徽章

| 類型 | 說明 |
|---|---|
| **Config** | 主要 JSON/YAML 組態檔 |
| **Instructions** | 指令／系統提示相關檔案 |
| **MCP** | MCP / mcp-servers 類組態 |

### 每列資訊

類型徽章、mono 路徑，以及開啟（系統預設編輯器／關聯程式）動作。

---

## 7. 診斷

![Doctor](../tests/screenshots/07.doctor.png)

**Doctor** 並行執行基本健康檢查。

### 執行方式

載入後每個工具一張卡片，先見載入動畫，檢查完成後逐張更新結果。

### 檢查項目

| 檢查 | 內容 |
|---|---|
| **Binary** | 是否在 `PATH` 中找到可執行的 CLI |
| **Auth** | 認證狀態 |
| **Config JSON** | 主要設定檔為 JSON 時是否可解析 |
| **MCP Config JSON** | MCP 設定檔為 JSON 時是否可解析 |

### 結果標示

沿用 ✅／⚠️／❌ 等符號區分 Pass／Warning／Fail。

---

## 8. 更新

![Update](../tests/screenshots/08.update.png)

**Update** 分頁比對現況並可觸發更新；按鈕 **🔍 Re-check All** 僅重新向 npm 等新版本來源查詢，不套用更新。

### 實際執行的指令

桌面程式透過 Electron 呼叫與 CLI 相同的 `update` 邏輯（底層即 `node dist/cli.js update <目標>`，等同 `ai update …`）。卡片上印的指令列來自程式碼 [`src/tools.ts`](../src/tools.ts)（`TOOL_UPDATE`）以及對 **AI Shelf 本身**自動偵測的套件管理程式。

| 目標 | 顯示的指令（`<cmd>` + 參數） |
|---|---|
| Claude Code | `claude update` |
| GitHub Copilot CLI | `copilot update` |
| Cursor | `agent update` |
| OpenAI Codex | `codex upgrade` |
| Google Gemini CLI | `gemini update` |
| Aider | `pip install -U aider-chat` |
| OpenCode | `opencode upgrade` |
| AI Shelf（self / desktop） | **安裝版**：啟動後檢查 GitHub Release，確認後在 App 內下載並重啟安裝（Update 分頁 **Download & upgrade desktop**）。**開發／原始碼**：依環境顯示 `pnpm` / `yarn` / `npm` 全域更新指令 |

對列在 `TOOL_NPM_PACKAGE` 的 CLI，程式會請 npm registry 協助決定是否有較新版本；桌面安裝版改以 `electron-updater` 比對 GitHub 上的 `latest.yml`。

---

## 備註

- 截圖順序由 `tests/e2e/screenshot.spec.ts` 產出，檔名與順序請與本文件、`pages.md` 保持一致。
- Release 前重產 README/docs 圖片：在 Windows 本地執行 `pnpm gen:docs-assets`（見 [RELEASE.md](RELEASE.md)）。
- 若 Inventory 分頁標籤或順序異動，請同步更新中英文頁面與前述測試常數。
