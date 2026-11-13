/**
 * Built-in task templates. Picking one opens the task editor prefilled in the current locale.
 * zh copy is Traditional Chinese (Taiwan).
 */
export type TemplateLocale = "en" | "zh";

export interface Localized {
  en: string;
  zh: string;
}

export interface TaskTemplate {
  id: string;
  name: Localized;
  description: Localized;
  prompt: Localized;
}

export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  {
    id: "review-branch",
    name: { en: "Review branch changes", zh: "審查分支變更" },
    description: {
      en: "Code review of the current branch against main.",
      zh: "對目前分支相對於 main 的變更做 code review。",
    },
    prompt: {
      en: [
        "Review the changes on the current git branch compared to main (use `git diff main...HEAD` and `git log main..HEAD`).",
        "",
        "Look for bugs, edge cases, security issues, missing tests and confusing code.",
        "List findings by severity with file and line references, and suggest concrete fixes.",
        "Do not modify any files.",
      ].join("\n"),
      zh: [
        "請審查目前 git 分支相對於 main 的變更（使用 `git diff main...HEAD` 與 `git log main..HEAD`）。",
        "",
        "找出 bug、邊界情況、資安問題、缺少的測試以及難以理解的程式碼。",
        "依嚴重程度列出發現，附上檔案與行號，並提出具體的修正建議。",
        "請不要修改任何檔案。",
      ].join("\n"),
    },
  },
  {
    id: "write-tests",
    name: { en: "Write tests for recent changes", zh: "為最近的變更補測試" },
    description: {
      en: "Add tests covering the latest commits and uncommitted work.",
      zh: "為最近的 commit 與尚未提交的修改補上測試。",
    },
    prompt: {
      en: [
        "Look at the recent changes in this repository (uncommitted changes and the last few commits).",
        "",
        "Write tests that cover the new or changed behavior, following the project's existing test framework and conventions.",
        "Run the tests and make sure they pass. Summarize what you covered and anything left untested.",
      ].join("\n"),
      zh: [
        "請檢視這個儲存庫最近的變更（尚未提交的修改以及最近幾個 commit）。",
        "",
        "依照專案現有的測試框架與慣例，為新增或修改的行為撰寫測試。",
        "執行測試並確認全部通過。最後摘要說明涵蓋了哪些部分，以及還有哪些沒有測到。",
      ].join("\n"),
    },
  },
  {
    id: "explain-architecture",
    name: { en: "Explain the architecture", zh: "說明專案架構" },
    description: {
      en: "A guided tour of this repository's structure and main flows.",
      zh: "導覽這個儲存庫的結構與主要流程。",
    },
    prompt: {
      en: [
        "Explain the architecture of this repository to a developer who is new to it.",
        "",
        "Cover: the main directories and what lives in each, entry points, how the major components talk to each other, key data flows, and the build / test / run commands.",
        "Point out anything surprising or non-obvious. Do not modify any files.",
      ].join("\n"),
      zh: [
        "請向剛接觸這個儲存庫的開發者說明它的架構。",
        "",
        "內容包含：主要目錄與各自的用途、程式進入點、主要元件之間如何互動、關鍵的資料流，以及建置／測試／執行的指令。",
        "請特別指出不直觀或容易踩雷的地方。請不要修改任何檔案。",
      ].join("\n"),
    },
  },
  {
    id: "standup-notes",
    name: { en: "Daily standup notes", zh: "每日站會筆記" },
    description: {
      en: "Summarize yesterday's work from git log for a standup.",
      zh: "從 git log 整理昨天的工作，作為站會報告。",
    },
    prompt: {
      en: [
        "Write my daily standup notes from git history.",
        "",
        "Use `git log --since=\"yesterday\" --author=\"$(git config user.name)\" --all` (go back to the last working day if that is empty) and the current uncommitted changes.",
        "Format as three short sections: Done, In progress, Blockers / questions. Use plain language, not commit hashes.",
      ].join("\n"),
      zh: [
        "請根據 git 歷史幫我整理每日站會筆記。",
        "",
        "使用 `git log --since=\"yesterday\" --author=\"$(git config user.name)\" --all`（如果沒有結果，就往前找到上一個工作日），並參考目前尚未提交的修改。",
        "分成三個簡短段落：已完成、進行中、卡關／待確認事項。請用白話描述，不要列 commit hash。",
      ].join("\n"),
    },
  },
  {
    id: "fix-lint-types",
    name: { en: "Fix lint and type errors", zh: "修正 lint 與型別錯誤" },
    description: {
      en: "Run the project's linter and type checker, then fix what they report.",
      zh: "執行專案的 linter 與型別檢查，並修正回報的問題。",
    },
    prompt: {
      en: [
        "Find and fix lint and type errors in this repository.",
        "",
        "Figure out the project's lint and type-check commands (package.json scripts, Makefile, config files) and run them.",
        "Fix the reported problems without changing behavior, and do not disable rules or add ignore comments unless there is no reasonable fix.",
        "Re-run the checks until they are clean, then summarize what you changed.",
      ].join("\n"),
      zh: [
        "請找出並修正這個儲存庫中的 lint 與型別錯誤。",
        "",
        "先找出專案的 lint 與型別檢查指令（package.json scripts、Makefile、設定檔等）並執行。",
        "在不改變行為的前提下修正回報的問題；除非沒有合理的修法，否則不要停用規則或加上忽略註解。",
        "重新執行檢查直到沒有錯誤，最後摘要說明修改了哪些地方。",
      ].join("\n"),
    },
  },
];

export interface LocalizedTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export function localizeTemplate(template: TaskTemplate, locale: TemplateLocale): LocalizedTemplate {
  return {
    id: template.id,
    name: template.name[locale],
    description: template.description[locale],
    prompt: template.prompt[locale],
  };
}
