"use strict";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const MESSAGES = {
  en: {
    windowTitle: "AI Shelf Setup",
    minimize: "Minimize",
    close: "Close",
    installTitle: "Install AI Shelf",
    updateTitle: "Update AI Shelf",
    reinstallTitle: "Reinstall AI Shelf",
    install: "Install",
    update: "Update",
    reinstall: "Reinstall",
    willInstallTo: "Installs to",
    installedAt: "Installed at",
    customize: "Customize",
    installFor: "Install for",
    onlyMe: "Only me",
    allUsers: "All users (needs administrator)",
    location: "Location",
    browse: "Browse…",
    finalPath: "AI Shelf will be installed in: {path}",
    dirErrorEmpty: "Choose a folder.",
    dirErrorNotAbsolute: "Use a full path, such as C:\\Apps.",
    dirErrorDriveRoot: "Pick a folder, not a drive root.",
    dirErrorInvalidChars: "The path can't contain quotes or line breaks.",
    dirErrorNotEmpty: "This folder already has other files. Pick an empty folder.",
    runningBody: "AI Shelf is running. Close it before continuing.",
    closeApp: "Close AI Shelf",
    forceClose: "Force close",
    forceCloseConfirm: "Force closing ends open terminals immediately. Continue?",
    cancel: "Cancel",
    recheck: "Check again",
    installingTitle: "Installing AI Shelf",
    updatingTitle: "Updating AI Shelf",
    stagePrepare: "Preparing",
    stageInstall: "Installing files",
    stageFinalize: "Finishing up",
    uacHint: "If Windows asks for permission, choose Yes to continue.",
    doneInstalled: "AI Shelf is installed",
    doneUpdated: "Updated to v{version}",
    doneBody: "Your settings and data are kept in your user profile.",
    launch: "Open AI Shelf",
    errorTitle: "Setup didn't finish",
    errorLaunch: "The installer couldn't start. Check that there is free disk space and try again.",
    errorExitCode: "The installer stopped before it finished.",
    errorNotInstalled:
      "Setup closed without installing. This usually means the administrator prompt was declined or AI Shelf was still open.",
    techDetails: "Technical details",
    useStandard: "Use standard installer",
    retry: "Try again",
    exitTitle: "Stop setup?",
    exitBody: "Installation is still running. Leaving now may leave AI Shelf half-installed.",
    keepInstalling: "Keep installing",
    exitAnyway: "Exit anyway",
  },
  zh: {
    windowTitle: "AI Shelf 安裝程式",
    minimize: "最小化",
    close: "關閉",
    installTitle: "安裝 AI Shelf",
    updateTitle: "更新 AI Shelf",
    reinstallTitle: "重新安裝 AI Shelf",
    install: "安裝",
    update: "更新",
    reinstall: "重新安裝",
    willInstallTo: "將安裝到",
    installedAt: "安裝位置",
    customize: "自訂",
    installFor: "安裝給",
    onlyMe: "只有我",
    allUsers: "所有使用者（需要管理員權限）",
    location: "位置",
    browse: "瀏覽…",
    finalPath: "AI Shelf 會安裝在：{path}",
    dirErrorEmpty: "請選擇資料夾。",
    dirErrorNotAbsolute: "請輸入完整路徑，例如 C:\\Apps。",
    dirErrorDriveRoot: "請選擇資料夾，不能直接使用磁碟根目錄。",
    dirErrorInvalidChars: "路徑不能包含引號或換行。",
    dirErrorNotEmpty: "這個資料夾已經有其他檔案，請選擇空的資料夾。",
    runningBody: "AI Shelf 正在執行，請先關閉再繼續。",
    closeApp: "關閉 AI Shelf",
    forceClose: "強制關閉",
    forceCloseConfirm: "強制關閉會立即結束所有開著的終端機，確定要繼續嗎？",
    cancel: "取消",
    recheck: "重新檢查",
    installingTitle: "正在安裝 AI Shelf",
    updatingTitle: "正在更新 AI Shelf",
    stagePrepare: "準備",
    stageInstall: "安裝檔案",
    stageFinalize: "完成設定",
    uacHint: "如果 Windows 詢問權限，請選擇「是」以繼續。",
    doneInstalled: "AI Shelf 已安裝",
    doneUpdated: "已更新至 v{version}",
    doneBody: "設定與資料都保存在你的使用者目錄中。",
    launch: "開啟 AI Shelf",
    errorTitle: "安裝沒有完成",
    errorLaunch: "無法啟動安裝程式，請確認磁碟空間足夠後再試一次。",
    errorExitCode: "安裝程式在完成前就停止了。",
    errorNotInstalled:
      "安裝程式結束了，但沒有完成安裝。通常是因為拒絕了管理員權限提示，或 AI Shelf 仍在執行。",
    techDetails: "技術細節",
    useStandard: "使用標準安裝程式",
    retry: "重試",
    exitTitle: "要停止安裝嗎？",
    exitBody: "安裝仍在進行中，現在離開可能會讓 AI Shelf 只裝到一半。",
    keepInstalling: "繼續安裝",
    exitAnyway: "仍要離開",
  },
};

let lang = "en";
const t = (key, params = {}) =>
  (MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");

const $ = (id) => document.getElementById(id);

const state = {
  ctx: null,
  mode: "currentUser",
  dirTouched: false,
  resolved: null, // { path, error }
  installing: false,
  lastOutcome: null,
};

function applyStaticText() {
  document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  document.title = t("windowTitle");
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
    el.title = t(el.dataset.i18nAria);
  }
}

function show(screen) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== `screen-${screen}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---- Start screen ----

function isUpdate() {
  return Boolean(state.ctx.existing);
}

function isSameVersion() {
  return isUpdate() && state.ctx.existing.version === state.ctx.payloadVersion;
}

function renderStart() {
  const { ctx } = state;
  const version = $("start-version");
  version.replaceChildren();

  if (isUpdate()) {
    $("start-title").textContent = isSameVersion() ? t("reinstallTitle") : t("updateTitle");
    if (ctx.existing.version && !isSameVersion()) {
      version.append(el("span", "pill", `v${ctx.existing.version}`), el("span", null, "→"));
    }
    version.append(el("span", "pill pill-new", `v${ctx.payloadVersion}`));
    $("custom").hidden = true;
    setLocationLine(t("installedAt"), ctx.existing.location);
    $("btn-install").textContent = isSameVersion() ? t("reinstall") : t("update");
  } else {
    $("start-title").textContent = t("installTitle");
    version.append(el("span", "pill pill-new", `v${ctx.payloadVersion}`));
    $("btn-install").textContent = t("install");
    $("dir-input").value = defaultDir(state.mode);
    void resolveDir();
  }
  renderRunning(ctx.appRunning);
}

function defaultDir(mode) {
  return mode === "allUsers" ? state.ctx.defaultDirAllUsers : state.ctx.defaultDirCurrentUser;
}

function setLocationLine(label, path) {
  const line = $("location-line");
  line.replaceChildren(document.createTextNode(`${label}  `), el("code", null, path));
  line.title = path;
}

let resolveSeq = 0;
async function resolveDir() {
  const seq = ++resolveSeq;
  const resolved = await invoke("resolve_dir", { dir: $("dir-input").value });
  if (seq !== resolveSeq) return;
  state.resolved = resolved;
  const preview = $("dir-preview");
  if (resolved.error) {
    const key = `dirError${resolved.error[0].toUpperCase()}${resolved.error.slice(1)}`;
    preview.textContent = t(key);
    preview.classList.add("error");
  } else {
    preview.textContent = t("finalPath", { path: resolved.path });
    preview.classList.remove("error");
  }
  setLocationLine(t("willInstallTo"), resolved.path);
  updateInstallButton();
}

function updateInstallButton() {
  const blocked =
    state.ctx.appRunning || (!isUpdate() && (!state.resolved || state.resolved.error));
  $("btn-install").disabled = Boolean(blocked);
}

function renderRunning(running) {
  state.ctx.appRunning = running;
  $("running-banner").hidden = !running;
  if (!running) $("btn-force-close").hidden = true;
  updateInstallButton();
}

// ---- Install ----

const STAGE_ORDER = ["prepare", "install", "finalize"];

function setProgress(stage, percent) {
  const idx = STAGE_ORDER.indexOf(stage);
  for (const li of document.querySelectorAll("#stages li")) {
    const i = STAGE_ORDER.indexOf(li.dataset.stage);
    li.classList.toggle("done", i < idx);
    li.classList.toggle("active", i === idx);
  }
  $("progress-stage").textContent = t(`stage${stage[0].toUpperCase()}${stage.slice(1)}`);
  const p = Math.max(0, Math.min(100, percent));
  $("bar-fill").style.width = `${p}%`;
  $("bar").setAttribute("aria-valuenow", String(p));
  $("percent").textContent = `${p}%`;
}

async function startInstall() {
  const running = await invoke("check_running");
  renderRunning(running);
  if (running) return;

  const update = isUpdate();
  const mode = update ? state.ctx.existing.mode : state.mode;
  const dir = update ? null : $("dir-input").value;

  $("progress-title").textContent = update ? t("updatingTitle") : t("installingTitle");
  $("uac-hint").hidden = mode !== "allUsers";
  setProgress("prepare", 0);
  show("progress");
  state.installing = true;
  try {
    await invoke("start_install", { mode, dir });
  } catch (err) {
    state.installing = false;
    showError({ reason: "launch", exitCode: null, detail: String(err) });
  }
}

function showDone(outcome) {
  state.lastOutcome = outcome;
  $("done-title").textContent = isUpdate()
    ? t("doneUpdated", { version: outcome.version })
    : t("doneInstalled");
  $("done-body").textContent = t("doneBody");
  show("done");
}

function showError(outcome) {
  const key = {
    launch: "errorLaunch",
    exitCode: "errorExitCode",
    notInstalled: "errorNotInstalled",
  }[outcome.reason];
  $("error-body").textContent = t(key ?? "errorExitCode");
  const lines = [];
  if (outcome.exitCode != null) lines.push(`exit code: ${outcome.exitCode}`);
  if (outcome.detail) lines.push(outcome.detail);
  $("error-detail").textContent = lines.join("\n");
  show("error");
}

// ---- Confirm / exit ----

let settleConfirm = null;

/** In-window confirm (window.confirm would show a browser-styled box). */
function askConfirm({ title, body, cancel, ok }) {
  settleConfirm?.(false);
  $("confirm-title").textContent = title;
  $("confirm-body").textContent = body;
  $("btn-confirm-cancel").textContent = cancel;
  $("btn-confirm-ok").textContent = ok;
  $("confirm").hidden = false;
  $("btn-confirm-cancel").focus();
  return new Promise((resolve) => {
    settleConfirm = (answer) => {
      settleConfirm = null;
      $("confirm").hidden = true;
      resolve(answer);
    };
  });
}

function dismissConfirm() {
  settleConfirm?.(false);
}

async function requestExit() {
  if (state.installing) {
    const leave = await askConfirm({
      title: t("exitTitle"),
      body: t("exitBody"),
      cancel: t("keepInstalling"),
      ok: t("exitAnyway"),
    });
    if (!leave) return;
  }
  void invoke("exit_setup");
}

// ---- Wiring ----

function wire() {
  $("btn-minimize").addEventListener("click", () => void appWindow.minimize());
  $("btn-close").addEventListener("click", requestExit);
  $("btn-done-close").addEventListener("click", () => void invoke("exit_setup"));
  $("btn-error-close").addEventListener("click", () => void invoke("exit_setup"));
  $("btn-confirm-cancel").addEventListener("click", () => settleConfirm?.(false));
  $("btn-confirm-ok").addEventListener("click", () => settleConfirm?.(true));

  $("btn-install").addEventListener("click", () => void startInstall());
  $("btn-retry").addEventListener("click", () => {
    show("start");
    void invoke("check_running").then(renderRunning);
  });
  $("btn-standard").addEventListener("click", () => void invoke("use_standard_installer"));
  $("btn-launch").addEventListener("click", async () => {
    try {
      await invoke("launch_app", { location: state.lastOutcome.location });
    } finally {
      void invoke("exit_setup");
    }
  });

  $("btn-close-app").addEventListener("click", async () => {
    const closed = await invoke("close_app", { force: false });
    renderRunning(!closed);
    // A graceful close may only hide AI Shelf to the tray — offer a force close then.
    if (!closed) $("btn-force-close").hidden = false;
  });
  $("btn-force-close").addEventListener("click", async () => {
    const ok = await askConfirm({
      title: t("forceClose"),
      body: t("forceCloseConfirm"),
      cancel: t("cancel"),
      ok: t("forceClose"),
    });
    if (!ok) return;
    renderRunning(!(await invoke("close_app", { force: true })));
  });
  $("btn-recheck").addEventListener("click", async () =>
    renderRunning(await invoke("check_running")),
  );

  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener("change", () => {
      state.mode = radio.value;
      if (!state.dirTouched) $("dir-input").value = defaultDir(state.mode);
      void resolveDir();
    });
  }
  let debounce = 0;
  $("dir-input").addEventListener("input", () => {
    state.dirTouched = true;
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void resolveDir(), 150);
  });
  $("btn-browse").addEventListener("click", async () => {
    const picked = await invoke("pick_folder", { start: $("dir-input").value });
    if (!picked) return;
    state.dirTouched = true;
    $("dir-input").value = picked;
    void resolveDir();
  });

  void listen("install-progress", ({ payload }) => setProgress(payload.stage, payload.percent));
  void listen("install-done", ({ payload }) => {
    state.installing = false;
    dismissConfirm();
    if (payload.kind === "installed") {
      setProgress("finalize", 100);
      window.setTimeout(() => showDone(payload), 350);
    } else {
      showError(payload);
    }
  });
  void listen("close-requested", requestExit);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismissConfirm();
  });
  // No browser context menu / reload in an installer window.
  document.addEventListener("contextmenu", (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
}

async function main() {
  state.ctx = await invoke("get_context");
  lang = state.ctx.locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  applyStaticText();
  wire();
  renderStart();
  show("start");
  await appWindow.show();
  await appWindow.setFocus();
}

void main();
