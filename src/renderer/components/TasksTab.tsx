import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  FolderOpen,
  LayoutTemplate,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/index.js";
import type {
  ProfileGroupNode,
  ProfileInfo,
  RunTaskRequest,
  RunTaskResult,
  TaskDef,
  TaskInput,
} from "../types";
import { TOOL_LAUNCH_CMD } from "../../tools.js";
import { toolDisplayName } from "../../tool-sort.js";
import {
  duplicateTaskName,
  filterTasks,
  precheckTaskRun,
  promptPreview,
  resolveTaskProfile,
  type TaskProfileResolution,
} from "../tasks/task-utils.js";
import { TASK_TEMPLATES, localizeTemplate } from "../tasks/task-templates.js";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { SectionHeading } from "./SectionHeading";
import { Spinner } from "./Spinner";

type RunFailure = Extract<RunTaskResult, { ok: false }>["reason"];

const RUN_FAILURE_KEY: Record<RunFailure, MessageKey> = {
  "profile-not-found": "tasks.run.profileNotFound",
  "no-agent-tool": "tasks.run.noAgentTool",
  busy: "tasks.run.busy",
  "spawn-failed": "tasks.run.spawnFailed",
};

const SAVE_ERROR_KEY: Record<string, MessageKey> = {
  "name-required": "tasks.err.nameRequired",
  "prompt-required": "tasks.err.promptRequired",
  "invalid-id": "tasks.err.invalidId",
  "not-found": "tasks.err.notFound",
};

/** Show the search box once the list is longer than this. */
const SEARCH_THRESHOLD = 4;

/**
 * Agent CLIs a task can launch when the parent passes no inventory (one id per display name).
 * Cursor is listed as `agent` (its interactive CLI, the id the inventory reports), not the
 * `cursor` editor launcher.
 */
function defaultAgentToolIds(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const ids = [
    "agent",
    ...Object.keys(TOOL_LAUNCH_CMD).filter((id) => id !== "cursor" && id !== "cursor-agent"),
  ];
  for (const id of ids) {
    const label = toolDisplayName(id);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(id);
  }
  return out;
}

const selectClass =
  "w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text focus:border-chrome-border-hover focus:outline-none";
const fieldLabelClass = "mb-1.5 block text-[12px] font-medium text-chrome-text-secondary";
const hintClass = "mt-1 text-[11px] text-chrome-text-dim";

interface RunError {
  taskId: string;
  taskName: string;
  reason: RunFailure;
}

interface EditorState {
  /** Existing task id; undefined creates a new task. */
  id?: string;
  name: string;
  description: string;
  profileId: string;
  tool: string;
  prompt: string;
}

function editorFromTask(task: TaskDef, groups: ProfileGroupNode[]): EditorState {
  const r = resolveTaskProfile(task.profileId, groups);
  return {
    id: task.id,
    name: task.name,
    description: task.description ?? "",
    // Normalize a name reference to the profile's id; keep an unresolved ref so it is not lost.
    profileId: r.kind === "found" ? r.profile.id : (task.profileId?.trim() ?? ""),
    tool: task.tool?.trim() ?? "",
    prompt: task.prompt,
  };
}

function toInput(state: EditorState): TaskInput {
  const description = state.description.trim();
  const profileId = state.profileId.trim();
  const tool = state.tool.trim();
  return {
    ...(state.id ? { id: state.id } : {}),
    name: state.name.trim(),
    prompt: state.prompt,
    ...(description ? { description } : {}),
    ...(profileId ? { profileId } : {}),
    ...(tool ? { tool } : {}),
  };
}

/**
 * Tasks mode: saved prompts. Running one opens a terminal pane in the task's profile with
 * its agent CLI and types the prompt once the agent is ready.
 */
export function TasksTab({
  active,
  onRunTask,
  availableTools,
}: {
  active: boolean;
  onRunTask: (req: RunTaskRequest) => Promise<RunTaskResult>;
  /** Installed agent tool ids from the inventory scan; defaults to every known agent CLI. */
  availableTools?: string[];
}) {
  const { t, locale } = useLocale();
  const [tasks, setTasks] = useState<TaskDef[]>([]);
  const [groups, setGroups] = useState<ProfileGroupNode[]>([]);
  /** False until the profile forest has loaded; profile warnings and pre-checks wait for it. */
  const [forestLoaded, setForestLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TaskDef | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<RunError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  // Reload tasks and profiles each time the page becomes visible (profiles change in Terminal mode).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoadFailed(false);
    void Promise.all([
      window.api.tasksList(),
      window.api.profileGroupGetForest().catch(() => ({ success: false as const })),
    ])
      .then(([list, forestRes]) => {
        if (cancelled) return;
        setTasks(list);
        if (forestRes.success && "forest" in forestRes && forestRes.forest) {
          setGroups(forestRes.forest.groups);
          setForestLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, reloadTick]);

  const resolutions = useMemo(() => {
    const map = new Map<string, TaskProfileResolution<ProfileInfo>>();
    for (const task of tasks) {
      const r = resolveTaskProfile(task.profileId, groups);
      // Without the forest every named profile would look missing; don't warn until it loads.
      map.set(task.id, r.kind === "missing" && !forestLoaded ? { kind: "active" } : r);
    }
    return map;
  }, [tasks, groups, forestLoaded]);

  const visible = useMemo(
    () =>
      filterTasks(tasks, query, (task) => {
        const r = resolutions.get(task.id);
        return r?.kind === "found" ? r.profile.name : undefined;
      }),
    [tasks, query, resolutions],
  );

  const toolChoices = useMemo(() => {
    const base = availableTools?.length
      ? availableTools.filter((id) => id !== "shell")
      : defaultAgentToolIds();
    return base;
  }, [availableTools]);

  const openNew = () => {
    setEditor({ name: "", description: "", profileId: "", tool: "", prompt: "" });
  };

  const openTemplate = (templateId: string) => {
    const tpl = TASK_TEMPLATES.find((x) => x.id === templateId);
    if (!tpl) return;
    const l = localizeTemplate(tpl, locale === "zh" ? "zh" : "en");
    setTemplatesOpen(false);
    setEditor({ name: l.name, description: l.description, profileId: "", tool: "", prompt: l.prompt });
  };

  const openEdit = (task: TaskDef) => {
    setRunError(null);
    setEditor(editorFromTask(task, groups));
  };

  const handleSaved = (saved: TaskDef) => {
    setTasks((prev) => {
      const next = prev.filter((x) => x.id !== saved.id);
      next.push(saved);
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    if (runError?.taskId === saved.id) setRunError(null);
    setEditor(null);
  };

  const duplicate = async (task: TaskDef) => {
    setActionError(null);
    const name = duplicateTaskName(
      task.name,
      tasks.map((x) => x.name),
      t("tasks.copySuffix"),
    );
    const { id: _id, updatedAt: _updated, ...rest } = task;
    try {
      const res = await window.api.tasksSave({ ...rest, name });
      if (res.ok) {
        setTasks((prev) => [...prev, res.task].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setActionError(t("tasks.duplicate.failed", { error: saveErrorText(res.error) }));
      }
    } catch (err) {
      setActionError(t("tasks.duplicate.failed", { error: errText(err) }));
    }
  };

  const confirmDelete = async () => {
    const task = pendingDelete;
    setPendingDelete(null);
    if (!task) return;
    setActionError(null);
    try {
      const res = await window.api.tasksDelete(task.id);
      if (res.ok) {
        setTasks((prev) => prev.filter((x) => x.id !== task.id));
        if (runError?.taskId === task.id) setRunError(null);
      } else {
        setActionError(t("tasks.delete.failed", { error: res.error ?? "" }));
      }
    } catch (err) {
      setActionError(t("tasks.delete.failed", { error: errText(err) }));
    }
  };

  const run = async (task: TaskDef) => {
    if (runningId) return;
    setRunError(null);
    setActionError(null);
    // Only explicit profiles are pre-checked: the runner's "active profile" is the terminal
    // workspace's, which may differ from the forest's last-active id. No forest = defer to the runner.
    const problem = forestLoaded ? precheckTaskRun(task, groups, null) : null;
    if (problem) {
      setRunError({ taskId: task.id, taskName: task.name, reason: problem });
      return;
    }
    setRunningId(task.id);
    try {
      const res = await onRunTask({
        prompt: task.prompt,
        ...(task.profileId?.trim() ? { profileId: task.profileId.trim() } : {}),
        ...(task.tool?.trim() ? { tool: task.tool.trim() } : {}),
      });
      if (!res.ok) setRunError({ taskId: task.id, taskName: task.name, reason: res.reason });
    } catch {
      setRunError({ taskId: task.id, taskName: task.name, reason: "spawn-failed" });
    } finally {
      setRunningId(null);
    }
  };

  function saveErrorText(code: string): string {
    const key = SAVE_ERROR_KEY[code];
    return key ? t(key) : code;
  }

  const erroredTask = runError ? tasks.find((x) => x.id === runError.taskId) : undefined;
  const showSearch = tasks.length > SEARCH_THRESHOLD;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-8 sm:px-5 sm:pt-5 sm:pb-10 lg:px-6">
      <div className="mx-auto w-full max-w-[1100px]">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading icon={ListChecks}>
            {t("tasks.title")}
            {tasks.length > 0 && (
              <span className="text-sm font-normal text-text-secondary">
                {t("tasks.count", { count: tasks.length })}
              </span>
            )}
          </SectionHeading>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void window.api.tasksOpenDir()}>
              <FolderOpen />
              {t("tasks.openFolder")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
              <LayoutTemplate />
              {t("tasks.fromTemplate")}
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus />
              {t("tasks.new")}
            </Button>
          </div>
        </div>
        <p className="mb-4 text-[13px] text-text-secondary">{t("tasks.subtitle")}</p>

        {runError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] text-text-primary"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("tasks.run.failedTitle", { name: runError.taskName })}</p>
              <p className="text-text-secondary">{t(RUN_FAILURE_KEY[runError.reason])}</p>
            </div>
            {erroredTask &&
              (runError.reason === "profile-not-found" || runError.reason === "no-agent-tool") && (
                <Button variant="outline" size="sm" onClick={() => openEdit(erroredTask)}>
                  <Pencil />
                  {t("tasks.run.editTask")}
                </Button>
              )}
            <button
              type="button"
              onClick={() => setRunError(null)}
              aria-label={t("tasks.dismiss")}
              className="cursor-pointer rounded-md p-1 text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-2xl border border-fail/40 bg-fail/10 px-4 py-3 text-[13px] text-text-primary"
          >
            <p className="min-w-0 flex-1 break-words">{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label={t("tasks.dismiss")}
              className="cursor-pointer rounded-md p-1 text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading ? (
          <Spinner label={t("tasks.loading")} />
        ) : loadFailed && tasks.length === 0 ? (
          <EmptyState
            title={t("tasks.loadFailed")}
            action={
              <Button variant="outline" size="sm" onClick={reload}>
                {t("tasks.retry")}
              </Button>
            }
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            bordered
            icon={<ListChecks className="h-8 w-8 text-accent" />}
            title={t("tasks.empty.title")}
            description={<span className="block max-w-md">{t("tasks.empty.desc")}</span>}
            action={
              <>
                <Button size="sm" onClick={openNew}>
                  <Plus />
                  {t("tasks.new")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
                  <LayoutTemplate />
                  {t("tasks.fromTemplate")}
                </Button>
              </>
            }
          />
        ) : (
          <>
            {showSearch && (
              <div className="relative mb-4 max-w-md">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-tertiary"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("tasks.search")}
                  className="border-border-strong bg-bg-card pl-9 text-[13px] text-text-primary placeholder:text-text-tertiary"
                />
              </div>
            )}
            {visible.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-text-secondary">
                {t("tasks.noMatches", { query: query.trim() })}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
                {visible.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    resolution={resolutions.get(task.id) ?? { kind: "active" }}
                    running={runningId === task.id}
                    runDisabled={runningId !== null}
                    onRun={() => void run(task)}
                    onEdit={() => openEdit(task)}
                    onDuplicate={() => void duplicate(task)}
                    onDelete={() => setPendingDelete(task)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <TaskEditorDialog
        state={editor}
        groups={groups}
        forestLoaded={forestLoaded}
        toolChoices={toolChoices}
        saveErrorText={saveErrorText}
        onClose={() => setEditor(null)}
        onSaved={handleSaved}
      />

      <TemplatePickerDialog
        open={templatesOpen}
        locale={locale === "zh" ? "zh" : "en"}
        onClose={() => setTemplatesOpen(false)}
        onPick={openTemplate}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("tasks.delete.title")}
        description={t("tasks.delete.desc", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("tasks.delete.confirm")}
        confirmVariant="destructive"
        defaultFocus="cancel"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function TaskCard({
  task,
  resolution,
  running,
  runDisabled,
  onRun,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  task: TaskDef;
  resolution: TaskProfileResolution<ProfileInfo>;
  running: boolean;
  runDisabled: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  const preview = promptPreview(task.prompt, 3);
  const tool = task.tool?.trim();
  const iconBtn =
    "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-accent-soft hover:text-text-primary";

  return (
    <Card dense hoverable className="flex flex-col">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-text-primary" title={task.name}>
            {task.name}
          </h3>
          {task.description?.trim() && (
            <p className="mt-0.5 line-clamp-2 text-[13px] text-text-secondary">{task.description}</p>
          )}
        </div>
        <Button size="sm" onClick={onRun} disabled={runDisabled} title={t("tasks.action.runHint")}>
          <Play className="fill-current" />
          {running ? t("tasks.action.running") : t("tasks.action.run")}
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        {resolution.kind === "missing" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-warn">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {t("tasks.card.profileMissing", { name: resolution.ref })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-bg-primary/70 px-2 py-0.5 text-text-secondary">
            <User className="h-3 w-3" aria-hidden />
            {resolution.kind === "found" ? resolution.profile.name : t("tasks.card.activeProfile")}
          </span>
        )}
        {tool && <Badge variant="info" text={toolDisplayName(tool)} />}
      </div>

      <pre
        className={cn(
          "mt-2.5 overflow-hidden rounded-xl bg-bg-primary/60 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-text-secondary",
          "line-clamp-3",
        )}
        title={task.prompt}
      >
        {preview.text}
        {preview.truncated ? " …" : ""}
      </pre>

      <div className="mt-2 flex items-center justify-end gap-0.5">
        <button type="button" className={iconBtn} onClick={onEdit} title={t("tasks.action.edit")} aria-label={t("tasks.action.edit")}>
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={iconBtn}
          onClick={onDuplicate}
          title={t("tasks.action.duplicate")}
          aria-label={t("tasks.action.duplicate")}
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtn, "hover:bg-fail/10 hover:text-fail")}
          onClick={onDelete}
          title={t("tasks.action.delete")}
          aria-label={t("tasks.action.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}

function TaskEditorDialog({
  state,
  groups,
  forestLoaded,
  toolChoices,
  saveErrorText,
  onClose,
  onSaved,
}: {
  state: EditorState | null;
  groups: ProfileGroupNode[];
  forestLoaded: boolean;
  toolChoices: string[];
  saveErrorText: (code: string) => string;
  onClose: () => void;
  onSaved: (task: TaskDef) => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<EditorState | null>(state);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the last form after close so the dialog can animate out with its content.
  useEffect(() => {
    if (!state) return;
    setForm(state);
    setError(null);
    setSaving(false);
  }, [state]);

  if (!form) return null;

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const profileRef = form.profileId.trim();
  const profileMissing =
    !!profileRef &&
    forestLoaded && !groups.some((g) => g.profiles.some((p) => p.id === profileRef || p.name === profileRef));
  const tools = form.tool && !toolChoices.includes(form.tool) ? [...toolChoices, form.tool] : toolChoices;

  const save = async () => {
    if (saving) return;
    if (!form.name.trim()) return setError(t("tasks.err.nameRequired"));
    if (!form.prompt.trim()) return setError(t("tasks.err.promptRequired"));
    setSaving(true);
    setError(null);
    try {
      const res = await window.api.tasksSave(toInput(form));
      if (res.ok) onSaved(res.task);
      else setError(t("tasks.err.saveFailed", { error: saveErrorText(res.error) }));
    } catch (err) {
      setError(t("tasks.err.saveFailed", { error: errText(err) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent
        className="flex max-h-[min(88vh,760px)] max-w-2xl flex-col gap-4"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {form.id ? t("tasks.editor.editTitle") : t("tasks.editor.createTitle")}
          </DialogTitle>
          <DialogDescription className="text-[12px]">{t("tasks.editor.desc")}</DialogDescription>
        </DialogHeader>

        <form
          className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <label htmlFor="task-name" className={fieldLabelClass}>
              {t("tasks.editor.name")} <span className="text-fail">*</span>
            </label>
            <Input
              id="task-name"
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("tasks.editor.namePlaceholder")}
              className="border-chrome-border-subtle bg-chrome-bg text-[13px] text-chrome-text placeholder:text-chrome-text-dim"
            />
          </div>

          <div>
            <label htmlFor="task-description" className={fieldLabelClass}>
              {t("tasks.editor.description")}
            </label>
            <Input
              id="task-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("tasks.editor.descriptionPlaceholder")}
              className="border-chrome-border-subtle bg-chrome-bg text-[13px] text-chrome-text placeholder:text-chrome-text-dim"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="task-profile" className={fieldLabelClass}>
                {t("tasks.editor.profile")}
              </label>
              <select
                id="task-profile"
                value={profileRef}
                onChange={(e) => set("profileId", e.target.value)}
                className={selectClass}
              >
                <option value="">{t("tasks.editor.profileActive")}</option>
                {profileMissing && (
                  <option value={profileRef}>{t("tasks.editor.profileMissing", { name: profileRef })}</option>
                )}
                {groups.map((g) =>
                  g.profiles.length === 0 ? null : (
                    <optgroup key={g.id} label={g.name}>
                      {g.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
              {profileMissing ? (
                <p className="mt-1 text-[11px] text-warn">{t("tasks.editor.profileMissingHint")}</p>
              ) : (
                <p className={hintClass}>{t("tasks.editor.profileHint")}</p>
              )}
            </div>

            <div>
              <label htmlFor="task-tool" className={fieldLabelClass}>
                {t("tasks.editor.tool")}
              </label>
              <select
                id="task-tool"
                value={form.tool}
                onChange={(e) => set("tool", e.target.value)}
                className={selectClass}
              >
                <option value="">{t("tasks.editor.toolDefault")}</option>
                {tools.map((id) => (
                  <option key={id} value={id}>
                    {toolDisplayName(id)}
                  </option>
                ))}
              </select>
              <p className={hintClass}>{t("tasks.editor.toolHint")}</p>
            </div>
          </div>

          <div>
            <label htmlFor="task-prompt" className={fieldLabelClass}>
              {t("tasks.editor.prompt")} <span className="text-fail">*</span>
            </label>
            <Textarea
              id="task-prompt"
              value={form.prompt}
              onChange={(e) => set("prompt", e.target.value)}
              placeholder={t("tasks.editor.promptPlaceholder")}
              spellCheck={false}
              className="field-sizing-fixed min-h-[200px] resize-y border-chrome-border-subtle bg-chrome-bg font-mono text-[12px] leading-relaxed text-chrome-text placeholder:text-chrome-text-dim"
            />
            <p className={hintClass}>{t("tasks.editor.promptHint")}</p>
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-fail/10 px-3 py-2 text-[12px] text-fail">
              {error}
            </p>
          )}
          {/* Lets Enter in a single-line input submit the form. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            {t("tasks.editor.cancel")}
          </Button>
          <Button type="button" variant="chromeSolid" size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? t("tasks.editor.saving") : t("tasks.editor.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePickerDialog({
  open,
  locale,
  onClose,
  onPick,
}: {
  open: boolean;
  locale: "en" | "zh";
  onClose: () => void;
  onPick: (templateId: string) => void;
}) {
  const { t } = useLocale();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[min(80vh,640px)] max-w-lg flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t("tasks.templates.title")}</DialogTitle>
          <DialogDescription className="text-[12px]">{t("tasks.templates.desc")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
          {TASK_TEMPLATES.map((tpl) => {
            const l = localizeTemplate(tpl, locale);
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onPick(tpl.id)}
                className="w-full cursor-pointer rounded-lg border border-chrome-border-subtle px-3 py-2.5 text-left transition-colors hover:border-chrome-border-hover hover:bg-chrome-hover"
              >
                <span className="block text-[13px] font-medium text-chrome-text">{l.name}</span>
                <span className="block text-[12px] text-chrome-text-muted">{l.description}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
