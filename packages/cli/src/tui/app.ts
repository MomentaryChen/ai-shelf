import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import type { AppContext } from "../infra/bootstrap.js";
import { createProfileTree, updateProfileTree } from "./components/profile-tree.js";
import { createSessionList, updateSessionList } from "./components/session-list.js";
import { createSessionDetail, updateSessionDetail } from "./components/session-detail.js";
import { createOutputPreview, updateOutputPreview } from "./components/output-preview.js";
import { createStatusBar, setStatusMessage } from "./components/status-bar.js";
import { RefreshCoordinator } from "./workers/refresh-coordinator.js";
import type { SessionModel } from "../models/session.js";
import type { ProfileInfo } from "../services/profile-service.js";
import { PROFILES_WORKSPACE_NAME } from "../services/profile-service.js";
import { APP_TITLE } from "../config/config.js";
import { AppError } from "../core/errors/app-error.js";

interface TuiState {
  profile: ProfileInfo | null;
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
    profile: null,
    sessions: [],
    selectedSession: null,
  };

  function loadProfileTreeData() {
    const tree = ctx.profileService.getTree();
    return { profiles: tree.profiles, lastActiveProfileId: tree.lastActiveProfileId };
  }

  let treeData = loadProfileTreeData();
  const profileTree = createProfileTree(left, treeData, (profile) => {
    state.profile = profile;
    refreshSessions();
    setStatusMessage(statusBar, profile.name);
  });

  const sessionList = createSessionList(center);
  const sessionDetail = createSessionDetail(right, 14);
  const outputPreview = createOutputPreview(right, 14);

  function reloadSelectedSession(): SessionModel | null {
    if (!state.selectedSession || !state.profile) return null;
    try {
      const fresh = ctx.sessionService.resolveSession(
        PROFILES_WORKSPACE_NAME,
        state.profile.name,
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
    treeData = loadProfileTreeData();
    updateProfileTree(profileTree, treeData);
    if (state.profile) {
      const match = treeData.profiles.find((p) => p.id === state.profile?.id);
      state.profile = match ?? null;
    }
  }

  function refreshSessions() {
    if (!state.profile) {
      updateSessionList(sessionList, []);
      updateSessionDetail(sessionDetail, null);
      updateOutputPreview(outputPreview, "", false);
      return;
    }
    try {
      state.sessions = ctx.sessionService.list(PROFILES_WORKSPACE_NAME, state.profile.name);
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
    if (!state.profile || !state.selectedSession) {
      setStatusMessage(statusBar, "Select a profile session first");
      screen.render();
      return;
    }
    try {
      await ctx.sessionService.start(
        PROFILES_WORKSPACE_NAME,
        state.profile.name,
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
    if (!state.profile || !state.selectedSession) return;
    try {
      ctx.sessionService.stop(
        PROFILES_WORKSPACE_NAME,
        state.profile.name,
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
    if (!state.profile) return;
    blessed.prompt(
      {
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
      },
      (err, value) => {
        if (err || !value?.trim()) {
          screenRef.render();
          return;
        }
        try {
          const result = ctx.execService.exec(
            PROFILES_WORKSPACE_NAME,
            state.profile!.name,
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
      },
    );
  }

  screen.key(["q", "C-c"], () => {
    refreshCoordinator.stop();
    ctx.close();
    process.exit(0);
  });

  screen.key(["r"], () => fullRefresh());
  screen.key(["s"], () => {
    void startSelectedSession();
  });
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
  profileTree.focus();
  screen.render();
}
