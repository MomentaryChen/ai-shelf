import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import type { AppContext } from "../infra/bootstrap.js";
import { createWorkspaceTree, updateWorkspaceTree } from "./components/workspace-tree.js";
import { createSessionList, updateSessionList } from "./components/session-list.js";
import { createSessionDetail, updateSessionDetail } from "./components/session-detail.js";
import { createOutputPreview, updateOutputPreview } from "./components/output-preview.js";
import { createStatusBar, setStatusMessage } from "./components/status-bar.js";
import { RefreshCoordinator } from "./workers/refresh-coordinator.js";
import type { SessionModel } from "../models/session.js";
import { APP_TITLE } from "../config/config.js";
import { AppError } from "../core/errors/app-error.js";

interface TuiState {
  workspaceName: string | null;
  groupName: string | null;
  sessions: SessionModel[];
  selectedSession: SessionModel | null;
}

export function startTui(ctx: AppContext): void {
  const screen = blessed.screen({
    smartCSR: true,
    title: APP_TITLE,
    fullUnicode: true,
  });

  const layout = blessed.layout({
    parent: screen,
    width: "100%",
    height: "100%-1",
    layout: "grid",
  });

  const left = blessed.box({ parent: layout, width: "25%", height: "100%", tags: true });
  const center = blessed.box({ parent: layout, width: "35%", height: "100%", left: "25%" });
  const right = blessed.box({ parent: layout, width: "40%", height: "100%", left: "60%", tags: true });

  const statusBar = createStatusBar(screen);
  const refreshCoordinator = new RefreshCoordinator();

  const state: TuiState = {
    workspaceName: null,
    groupName: null,
    sessions: [],
    selectedSession: null,
  };

  function loadTreeData() {
    const workspaces = ctx.workspaceService.list();
    const groupsByWorkspace = new Map<string, import("../models/group.js").GroupModel[]>();
    for (const ws of workspaces) {
      groupsByWorkspace.set(ws.id, ctx.groupService.list(ws.name));
    }
    return { workspaces, groupsByWorkspace };
  }

  let treeData = loadTreeData();
  const workspaceTree = createWorkspaceTree(left, treeData, (workspaceName, groupName) => {
    state.workspaceName = workspaceName;
    state.groupName = groupName ?? null;
    refreshSessions();
    setStatusMessage(
      statusBar,
      groupName ? `${workspaceName} / ${groupName}` : workspaceName,
    );
  });

  const sessionList = createSessionList(center);
  const sessionDetail = createSessionDetail(right, 14);
  const outputPreview = createOutputPreview(right, 14);

  function reloadSelectedSession(): SessionModel | null {
    if (!state.selectedSession || !state.workspaceName || !state.groupName) return null;
    try {
      const fresh = ctx.sessionService.resolveSession(
        state.workspaceName,
        state.groupName,
        state.selectedSession.name,
      );
      state.selectedSession = fresh;
      return fresh;
    } catch {
      return state.selectedSession;
    }
  }

  function updatePreviewPanel() {
    const session = state.selectedSession;
    if (!session) {
      updateOutputPreview(outputPreview, "", false);
      return;
    }
    const preview = ctx.sessionRuntime.getPreview(session.id, 8000);
    updateOutputPreview(outputPreview, preview, session.status === "running");
  }

  function refreshSelectionUi() {
    const session = reloadSelectedSession();
    updateSessionDetail(sessionDetail, session);
    updatePreviewPanel();
    screen.render();
  }

  sessionList.on("select", (_item, index) => {
    const session = state.sessions[index];
    if (session) {
      state.selectedSession = session;
      refreshSelectionUi();
    }
  });

  function refreshTree() {
    treeData = loadTreeData();
    updateWorkspaceTree(workspaceTree, treeData);
  }

  function refreshSessions() {
    if (!state.workspaceName) {
      updateSessionList(sessionList, []);
      updateSessionDetail(sessionDetail, null);
      updateOutputPreview(outputPreview, "", false);
      return;
    }
    try {
      state.sessions = ctx.sessionService.list(
        state.workspaceName,
        state.groupName ?? undefined,
      );
      updateSessionList(sessionList, state.sessions);
      if (state.selectedSession) {
        const match = state.sessions.find((s) => s.id === state.selectedSession?.id);
        state.selectedSession = match ?? state.sessions[0] ?? null;
      } else {
        state.selectedSession = state.sessions[0] ?? null;
      }
      refreshSelectionUi();
    } catch {
      updateSessionList(sessionList, []);
    }
  }

  function fullRefresh() {
    refreshTree();
    refreshSessions();
    setStatusMessage(statusBar, "Refreshed");
  }

  async function startSelectedSession() {
    if (!state.workspaceName || !state.groupName || !state.selectedSession) {
      setStatusMessage(statusBar, "Select a session first");
      screen.render();
      return;
    }
    try {
      await ctx.sessionService.start(
        state.workspaceName,
        state.groupName,
        state.selectedSession.name,
      );
      refreshSessions();
      setStatusMessage(statusBar, `Started ${state.selectedSession.name}`);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : String(err);
      setStatusMessage(statusBar, msg);
    }
    screen.render();
  }

  function stopSelectedSession() {
    if (!state.workspaceName || !state.groupName || !state.selectedSession) return;
    try {
      ctx.sessionService.stop(
        state.workspaceName,
        state.groupName,
        state.selectedSession.name,
      );
      refreshSessions();
      setStatusMessage(statusBar, `Stopped ${state.selectedSession.name}`);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : String(err);
      setStatusMessage(statusBar, msg);
    }
    screen.render();
  }

  function promptExec(screenRef: Widgets.Screen, broadcast: boolean) {
    if (!state.workspaceName || !state.groupName) return;
    blessed.prompt({
      parent: screenRef,
      border: "line",
      height: 3,
      width: "70%",
      top: "center",
      left: "center",
      label: broadcast ? " Broadcast Exec " : " Exec ",
      tags: true,
      keys: true,
      vi: true,
      style: { fg: "white", bg: "blue", border: { fg: "cyan" } },
    }, (err, value) => {
      if (err || !value?.trim()) {
        screenRef.render();
        return;
      }
      try {
        const result = ctx.execService.exec(
          state.workspaceName!,
          state.groupName!,
          value.trim(),
          broadcast
            ? { broadcast: true }
            : state.selectedSession
              ? { session: state.selectedSession.name }
              : undefined,
        );
        if ("sent" in result) {
          setStatusMessage(
            statusBar,
            `Broadcast → ${result.sent.join(", ")}${result.skipped.length ? ` (${result.skipped.length} skipped)` : ""}`,
          );
        } else {
          setStatusMessage(statusBar, `Exec → ${result.sessionName}`);
        }
      } catch (ex) {
        const msg = ex instanceof AppError ? ex.message : String(ex);
        setStatusMessage(statusBar, msg);
      }
      screenRef.render();
    });
  }

  screen.key(["q", "C-c"], () => {
    refreshCoordinator.stop();
    ctx.close();
    process.exit(0);
  });

  screen.key(["r"], () => fullRefresh());
  screen.key(["s"], () => { void startSelectedSession(); });
  screen.key(["x"], () => stopSelectedSession());
  screen.key(["e"], () => promptExec(screen, false));
  screen.key(["B"], () => promptExec(screen, true));
  screen.key(["tab"], () => sessionList.focus());

  refreshCoordinator.start(ctx, {
    onTick: () => {
      if (state.selectedSession?.status === "running") {
        updatePreviewPanel();
        screen.render();
      }
    },
    onEvent: () => refreshSessions(),
  });

  refreshTree();
  workspaceTree.focus();
  screen.render();
}
