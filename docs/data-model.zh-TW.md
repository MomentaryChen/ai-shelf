# 資料模型 — Profile 優先（2.0）

AI Shelf 使用**同一個 SQLite 資料庫**（Windows：`%APPDATA%/ai-shelf/workspaces.db`）。**桌面應用**與 **`ai-shelf` CLI/TUI** 讀寫同一檔案。

## 使用者模型：Profile

**Profile** 是組織終端機的主要單位：

| 概念 | 說明 |
|------|------|
| **Profile** | 具名環境：預設目錄、預設 AI 工具、強調色、是否廣播輸入 |
| **Pane / 終端機** | 一個內嵌終端機（工具 + cwd + 可選標題），每 Profile 最多 8 個 |
| **Layout** | 每 Profile 持久化的分割窗格樹 |

建立與管理：

- 桌面：**Profile** 側欄
- CLI：`ai-shelf profile list|create|update|delete|reorder|exec`

## 儲存對應（內部）

Profile 沿用舊表名以相容既有資料：

```
Profile  →  workspace「Profiles」底下的 group 列
Pane 版面  →  group_layouts 快照（JSON）
上次使用中 Profile  →  app_preferences.last_active_group_key
```

隱藏的 **`Profiles`** workspace 會自動建立；一般不需要再建立其他 workspace。

## CLI session 與桌面 pane

| 介面 | 執行中終端機 | 持久化 |
|------|-------------|--------|
| **桌面** | Electron main 的 `node-pty` | `group_layouts` 中的 pane 與 layout |
| **CLI / TUI** | `SessionRuntime` PTY | `sessions` 表（以 Profile 名稱為 group） |

兩者共用 **Profile 中繼資料**（名稱、預設值、layout 快照）。桌面 pane 與 CLI 具名 session 是不同 runtime 路徑；對 CLI session 送指令請用 **`profile exec`**。

## 已 deprecated 的舊指令

仍可使用但會印出警告：

- `ai-shelf workspace …`
- `ai-shelf group …`
- `ai-shelf session …`（若鎖定 `Profiles` + Profile 名稱則為 CLI session 的舊路徑）

新流程請一律使用 **`ai-shelf profile …`**。

## IPC（Electron）

Renderer 主 UI 使用 Profile API：

- `profile-get-tree`、`profile-create`、`profile-update`、`profile-delete`、`profile-reorder`

版面持久化仍走內部 group-layout handler（`ws-group-layout-*`），鍵為 `workspaceId:groupId`，等同 Profile 儲存鍵。

舊版 workspace tree IPC（`ws-get-tree`、`ws-workspace-create` 等）保留供 migration，桌面 UI 已不再使用。
