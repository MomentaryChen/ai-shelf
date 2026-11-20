import {
  AlertTriangle,
  ArrowRight,
  FileCode2,
  FolderOpen,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CLAUDE_DEFAULT_MODES,
  CLAUDE_HOOK_EVENTS,
  CLAUDE_SETTINGS_SCOPES,
  PERMISSION_LISTS,
  emptyDraft,
  findPermissionConflicts,
  parseClaudeSettingsText,
  renderClaudeSettingsEdit,
  isOpaqueHook,
  validateHookCommand,
  validateHookEvent,
  validateHookMatcher,
  validatePermissionRule,
  type ClaudeSettingsDraft,
  type ClaudeSettingsScope,
  type HookWarning,
  type PermissionListKey,
  type PermissionRuleWarning,
} from "../../shared/claude-settings.js";
import type { ClaudeSettingsFileInfo, ClaudeSettingsReadResult } from "../types";
import { computeLineDiff, type DiffLine } from "../utils/diff-tools";
import { EmptyState } from "./EmptyState";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

const PROJECT_DIR_KEY = "aishelf.claudeSettings.projectDir";

function loadStoredProjectDir(): string {
  try {
    return localStorage.getItem(PROJECT_DIR_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeProjectDir(dir: string): void {
  try {
    localStorage.setItem(PROJECT_DIR_KEY, dir);
  } catch {
    /* ignore */
  }
}

const RULE_WARNING_KEY: Record<PermissionRuleWarning, MessageKey> = {
  empty: "claudeSettings.warn.ruleEmpty",
  unbalancedParens: "claudeSettings.warn.ruleParens",
  unknownTool: "claudeSettings.warn.ruleUnknownTool",
  badFormat: "claudeSettings.warn.ruleFormat",
};

const HOOK_WARNING_KEY: Record<HookWarning, MessageKey> = {
  emptyCommand: "claudeSettings.warn.hookEmptyCommand",
  badTimeout: "claudeSettings.warn.hookTimeout",
  unknownEvent: "claudeSettings.warn.hookUnknownEvent",
  matcherIgnored: "claudeSettings.warn.hookMatcherIgnored",
  badMatcher: "claudeSettings.warn.hookBadMatcher",
};

const LIST_LABEL_KEY: Record<PermissionListKey, MessageKey> = {
  allow: "claudeSettings.list.allow",
  ask: "claudeSettings.list.ask",
  deny: "claudeSettings.list.deny",
};

const LIST_TONE: Record<PermissionListKey, string> = {
  allow: "text-ok",
  ask: "text-warn",
  deny: "text-fail",
};

const SCOPE_LABEL_KEY: Record<ClaudeSettingsScope, MessageKey> = {
  user: "claudeSettings.scope.user",
  project: "claudeSettings.scope.project",
  local: "claudeSettings.scope.local",
};

const fieldClass = "h-8 border-border bg-bg-primary font-mono text-xs text-text-primary";
const selectClass =
  "h-8 rounded-md border border-border bg-bg-primary px-2 text-xs text-text-primary outline-none focus-visible:border-ring";
const iconBtnClass =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-accent-surface hover:text-text-primary";

function WarningIcon({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex shrink-0 text-warn">
      <AlertTriangle aria-label={text} className="size-3.5" />
    </span>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-bg-card p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

/** Text input + Add button; Enter adds. */
function AddRow({
  placeholder,
  onAdd,
  addLabel,
}: {
  placeholder: string;
  onAdd: (value: string) => void;
  addLabel: string;
}) {
  const [value, setValue] = useState("");
  const add = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
  };
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        className={fieldClass}
      />
      <Button size="sm" variant="outline" onClick={add} disabled={!value.trim()}>
        <Plus aria-hidden /> {addLabel}
      </Button>
    </div>
  );
}

// ── Permissions ──────────────────────────────────────────────────────────────

function PermissionsEditor({
  draft,
  onChange,
}: {
  draft: ClaudeSettingsDraft;
  onChange: (fn: (d: ClaudeSettingsDraft) => void) => void;
}) {
  const { t } = useLocale();
  const perms = draft.permissions;
  const conflicts = useMemo(() => findPermissionConflicts(perms), [perms]);
  const conflictByRule = useMemo(
    () => new Map(conflicts.map((c) => [c.rule, c.lists])),
    [conflicts],
  );
  const modeOptions: string[] = [...CLAUDE_DEFAULT_MODES];
  if (perms.defaultMode && !modeOptions.includes(perms.defaultMode)) modeOptions.push(perms.defaultMode);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-tertiary">{t("claudeSettings.permissions.hint")}</p>
      {conflicts.length > 0 && (
        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-text-primary">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle aria-hidden className="size-3.5 text-warn" />
            {t("claudeSettings.conflicts.title")}
          </p>
          <ul className="mt-1 list-disc pl-5 font-mono">
            {conflicts.map((c) => (
              <li key={c.rule}>
                {c.rule} — {c.lists.map((l) => t(LIST_LABEL_KEY[l])).join(" / ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-text-tertiary">{t("claudeSettings.conflicts.precedence")}</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {PERMISSION_LISTS.map((list) => (
          <Section
            key={list}
            icon={<ShieldCheck aria-hidden className={`size-3.5 ${LIST_TONE[list]}`} />}
            title={`${t(LIST_LABEL_KEY[list])} (${perms[list].length})`}
          >
            {perms[list].length === 0 ? (
              <p className="py-2 text-xs text-text-tertiary">{t("claudeSettings.list.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {perms[list].map((rule, i) => {
                  const warning = validatePermissionRule(rule);
                  const conflict = conflictByRule.get(rule.trim());
                  return (
                    <li key={`${list}-${i}`} className="flex items-center gap-1">
                      <Input
                        value={rule}
                        aria-label={t(LIST_LABEL_KEY[list])}
                        onChange={(e) =>
                          onChange((d) => {
                            d.permissions[list][i] = e.target.value;
                          })
                        }
                        className={fieldClass}
                      />
                      {warning && <WarningIcon text={t(RULE_WARNING_KEY[warning])} />}
                      {conflict && (
                        <WarningIcon
                          text={t("claudeSettings.conflicts.rule", {
                            lists: conflict.map((l) => t(LIST_LABEL_KEY[l])).join(" / "),
                          })}
                        />
                      )}
                      <select
                        aria-label={t("claudeSettings.moveTo")}
                        title={t("claudeSettings.moveTo")}
                        value=""
                        onChange={(e) => {
                          const target = e.target.value as PermissionListKey;
                          if (!target) return;
                          onChange((d) => {
                            const [moved] = d.permissions[list].splice(i, 1);
                            if (moved !== undefined) d.permissions[target].push(moved);
                          });
                        }}
                        className={`${selectClass} w-8 px-1`}
                      >
                        <option value="">⇄</option>
                        {PERMISSION_LISTS.filter((l) => l !== list).map((l) => (
                          <option key={l} value={l}>
                            {t("claudeSettings.moveToList", { list: t(LIST_LABEL_KEY[l]) })}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={iconBtnClass}
                        title={t("claudeSettings.remove")}
                        aria-label={t("claudeSettings.remove")}
                        onClick={() =>
                          onChange((d) => {
                            d.permissions[list].splice(i, 1);
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <AddRow
              placeholder={t("claudeSettings.rule.placeholder")}
              addLabel={t("claudeSettings.add")}
              onAdd={(v) =>
                onChange((d) => {
                  d.permissions[list].push(v);
                })
              }
            />
          </Section>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section
          icon={<ShieldCheck aria-hidden className="size-3.5 text-accent" />}
          title={t("claudeSettings.defaultMode")}
        >
          <select
            value={perms.defaultMode}
            onChange={(e) =>
              onChange((d) => {
                d.permissions.defaultMode = e.target.value;
              })
            }
            className={`${selectClass} w-full`}
          >
            <option value="">{t("claudeSettings.defaultMode.unset")}</option>
            {modeOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Section>
        <Section
          icon={<FolderOpen aria-hidden className="size-3.5 text-accent" />}
          title={t("claudeSettings.additionalDirectories")}
        >
          <ul className="flex flex-col gap-1">
            {perms.additionalDirectories.map((dir, i) => (
              <li key={`dir-${i}`} className="flex items-center gap-1">
                <Input
                  value={dir}
                  onChange={(e) =>
                    onChange((d) => {
                      d.permissions.additionalDirectories[i] = e.target.value;
                    })
                  }
                  className={fieldClass}
                />
                <button
                  type="button"
                  className={iconBtnClass}
                  title={t("claudeSettings.remove")}
                  aria-label={t("claudeSettings.remove")}
                  onClick={() =>
                    onChange((d) => {
                      d.permissions.additionalDirectories.splice(i, 1);
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <AddRow
            placeholder="../docs"
            addLabel={t("claudeSettings.add")}
            onAdd={(v) =>
              onChange((d) => {
                d.permissions.additionalDirectories.push(v);
              })
            }
          />
        </Section>
      </div>
    </div>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function HooksEditor({
  draft,
  onChange,
}: {
  draft: ClaudeSettingsDraft;
  onChange: (fn: (d: ClaudeSettingsDraft) => void) => void;
}) {
  const { t } = useLocale();
  const [newEvent, setNewEvent] = useState<string>(CLAUDE_HOOK_EVENTS[0]);

  const addEvent = () =>
    onChange((d) => {
      const group = { matcher: "", commands: [{ command: "", extra: {} }], extra: {} };
      const existing = d.hooks.find((e) => e.event === newEvent);
      if (existing) existing.groups.push(group);
      else d.hooks.push({ event: newEvent, groups: [group] });
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-tertiary">{t("claudeSettings.hooks.hint")}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={newEvent}
          aria-label={t("claudeSettings.hooks.event")}
          onChange={(e) => setNewEvent(e.target.value)}
          className={selectClass}
        >
          {CLAUDE_HOOK_EVENTS.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={addEvent}>
          <Plus aria-hidden /> {t("claudeSettings.hooks.addEvent")}
        </Button>
      </div>

      {draft.hooks.length === 0 ? (
        <EmptyState
          compact
          bordered
          icon={<Webhook aria-hidden className="size-5 text-text-tertiary" />}
          title={t("claudeSettings.hooks.empty")}
          description={t("claudeSettings.hooks.emptyHint")}
        />
      ) : (
        draft.hooks.map((ev, ei) => {
          const eventWarning = validateHookEvent(ev.event);
          return (
            <Section
              key={`${ev.event}-${ei}`}
              icon={<Webhook aria-hidden className="size-3.5 text-accent" />}
              title={
                <span className="flex flex-1 items-center gap-1.5">
                  <span className="font-mono">{ev.event}</span>
                  {eventWarning && <WarningIcon text={t(HOOK_WARNING_KEY[eventWarning])} />}
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-7 text-xs"
                      onClick={() =>
                        onChange((d) => {
                          d.hooks[ei]!.groups.push({
                            matcher: "",
                            commands: [{ command: "", extra: {} }],
                            extra: {},
                          });
                        })
                      }
                    >
                      <Plus aria-hidden /> {t("claudeSettings.hooks.addGroup")}
                    </Button>
                    <button
                      type="button"
                      className={iconBtnClass}
                      title={t("claudeSettings.hooks.removeEvent")}
                      aria-label={t("claudeSettings.hooks.removeEvent")}
                      onClick={() =>
                        onChange((d) => {
                          d.hooks.splice(ei, 1);
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </span>
              }
            >
              <div className="flex flex-col gap-2">
                {ev.groups.map((g, gi) => {
                  const matcherWarning = validateHookMatcher(ev.event, g.matcher);
                  return (
                    <div
                      key={`g-${gi}`}
                      className="rounded-md border border-border/70 bg-bg-primary/40 p-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-20 shrink-0 text-[11px] text-text-secondary">
                          {t("claudeSettings.hooks.matcher")}
                        </span>
                        <Input
                          value={g.matcher}
                          placeholder={t("claudeSettings.hooks.matcherPlaceholder")}
                          onChange={(e) =>
                            onChange((d) => {
                              d.hooks[ei]!.groups[gi]!.matcher = e.target.value;
                            })
                          }
                          className={fieldClass}
                        />
                        {matcherWarning && <WarningIcon text={t(HOOK_WARNING_KEY[matcherWarning])} />}
                        <button
                          type="button"
                          className={iconBtnClass}
                          title={t("claudeSettings.hooks.removeGroup")}
                          aria-label={t("claudeSettings.hooks.removeGroup")}
                          onClick={() =>
                            onChange((d) => {
                              d.hooks[ei]!.groups.splice(gi, 1);
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <ul className="mt-2 flex flex-col gap-1">
                        {g.commands.map((c, ci) => {
                          const cmdWarning = validateHookCommand(c);
                          const type = typeof c.extra["type"] === "string" ? c.extra["type"] : "command";
                          return (
                            <li key={`c-${ci}`} className="flex items-center gap-1.5">
                              <span
                                className="w-20 shrink-0 truncate text-[11px] text-text-secondary"
                                title={type}
                              >
                                {type}
                              </span>
                              {isOpaqueHook(c) ? (
                                <span
                                  className="min-w-0 flex-1 truncate rounded-md border border-dashed border-border px-2 py-1.5 font-mono text-xs text-text-tertiary"
                                  title={`${t("claudeSettings.hooks.opaque")}
${JSON.stringify(c.extra, null, 2)}`}
                                >
                                  {JSON.stringify(c.extra)}
                                </span>
                              ) : (
                              <>
                              <Input
                                value={c.command}
                                placeholder={t("claudeSettings.hooks.commandPlaceholder")}
                                onChange={(e) =>
                                  onChange((d) => {
                                    d.hooks[ei]!.groups[gi]!.commands[ci]!.command = e.target.value;
                                  })
                                }
                                className={fieldClass}
                              />
                              <Input
                                type="number"
                                min={1}
                                value={c.timeout ?? ""}
                                placeholder={t("claudeSettings.hooks.timeout")}
                                title={t("claudeSettings.hooks.timeoutHint")}
                                onChange={(e) =>
                                  onChange((d) => {
                                    const raw = e.target.value.trim();
                                    d.hooks[ei]!.groups[gi]!.commands[ci]!.timeout =
                                      raw === "" ? undefined : Number(raw);
                                  })
                                }
                                className={`${fieldClass} w-24 shrink-0`}
                              />
                              </>
                              )}
                              {cmdWarning && <WarningIcon text={t(HOOK_WARNING_KEY[cmdWarning])} />}
                              <button
                                type="button"
                                className={iconBtnClass}
                                title={t("claudeSettings.remove")}
                                aria-label={t("claudeSettings.remove")}
                                onClick={() =>
                                  onChange((d) => {
                                    d.hooks[ei]!.groups[gi]!.commands.splice(ci, 1);
                                  })
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 min-h-7 text-xs"
                        onClick={() =>
                          onChange((d) => {
                            d.hooks[ei]!.groups[gi]!.commands.push({ command: "", extra: {} });
                          })
                        }
                      >
                        <Plus aria-hidden /> {t("claudeSettings.hooks.addCommand")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Section>
          );
        })
      )}
    </div>
  );
}

// ── Save preview ─────────────────────────────────────────────────────────────

function DiffPreview({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="max-h-[50vh] overflow-auto rounded-md border border-border bg-bg-primary p-2 font-mono text-[11px] leading-relaxed">
      {lines.map((l, i) => (
        <div
          key={i}
          className={
            l.type === "add"
              ? "bg-ok/10 text-ok"
              : l.type === "remove"
                ? "bg-fail/10 text-fail"
                : "text-text-tertiary"
          }
        >
          {l.type === "add" ? "+ " : l.type === "remove" ? "- " : "  "}
          {l.text}
        </div>
      ))}
    </pre>
  );
}

// ── Dialog ───────────────────────────────────────────────────────────────────

/**
 * Visual editor for Claude Code `permissions` and `hooks` in the user / project /
 * local `settings.json`. All file access goes through scope-restricted IPC; every
 * other key in the file is preserved.
 */
export function ClaudeHooksPermissionsDialog({
  onClose,
  onEditRaw,
}: {
  onClose: () => void;
  /** Open the raw text editor for a settings file (used when it is not valid JSON). */
  onEditRaw: (path: string) => void;
}) {
  const { t } = useLocale();
  const [scope, setScope] = useState<ClaudeSettingsScope>("user");
  const [projectDir, setProjectDir] = useState<string>(loadStoredProjectDir);
  const [knownProjects, setKnownProjects] = useState<string[]>([]);
  const [files, setFiles] = useState<ClaudeSettingsFileInfo[]>([]);
  const [file, setFile] = useState<ClaudeSettingsReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ClaudeSettingsDraft>(emptyDraft);
  const [baseline, setBaseline] = useState<string>("");
  const [tab, setTab] = useState<"permissions" | "hooks">("permissions");
  const [preview, setPreview] = useState<{ next: string; lines: DiffLine[] | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);

  const needsProject = scope !== "user";
  const project = needsProject ? projectDir || undefined : undefined;

  const refreshFiles = useCallback(async () => {
    const res = await window.api.claudeSettingsListFiles(projectDir || undefined);
    setFiles(res.files);
    setKnownProjects(res.knownProjects);
  }, [projectDir]);

  const load = useCallback(async () => {
    setStatus(null);
    setConflict(false);
    setPreview(null);
    if (needsProject && !projectDir) {
      setFile(null);
      return;
    }
    setLoading(true);
    try {
      const res = await window.api.claudeSettingsRead(scope, project);
      setFile(res);
      const parsed = res.ok ? parseClaudeSettingsText(res.content) : null;
      const next = parsed?.ok ? parsed.draft : emptyDraft();
      setDraft(next);
      setBaseline(JSON.stringify(next));
    } finally {
      setLoading(false);
    }
  }, [needsProject, projectDir, project, scope]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsed = useMemo(
    () => (file?.ok ? parseClaudeSettingsText(file.content) : null),
    [file],
  );
  const invalidJson = parsed && !parsed.ok ? parsed.error : null;
  const dirty = JSON.stringify(draft) !== baseline;
  const canSave = !!file?.ok && !invalidJson && (dirty || !file.exists);

  const update = (fn: (d: ClaudeSettingsDraft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  /** Switching scope / project reloads the draft — confirm before dropping edits. */
  const confirmDiscard = () => !dirty || window.confirm(t("claudeSettings.discardConfirm"));
  const requestClose = () => {
    if (confirmDiscard()) onClose();
  };
  const requestRaw = (path: string) => {
    if (confirmDiscard()) onEditRaw(path);
  };

  const chooseScope = (s: ClaudeSettingsScope) => {
    if (s === scope || !confirmDiscard()) return;
    setScope(s);
  };

  const chooseProject = (dir: string) => {
    if (dir === projectDir || !confirmDiscard()) return;
    setProjectDir(dir);
    storeProjectDir(dir);
  };

  const browse = async () => {
    const picked = await window.api.pickFolder(projectDir || undefined);
    if (picked) chooseProject(picked);
  };

  const openPreview = () => {
    if (!file) return;
    try {
      const next = renderClaudeSettingsEdit(file.content, draft);
      const diff = computeLineDiff(file.content, next);
      setPreview({ next, lines: diff.ok ? diff.result.lines : null });
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    }
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await window.api.claudeSettingsWrite(scope, project, file.content, draft);
      if (res.ok) {
        setPreview(null);
        await refreshFiles();
        await load();
        setStatus({ kind: "ok", text: t("claudeSettings.saved", { path: res.path ?? file.path }) });
      } else {
        setPreview(null);
        setConflict(!!res.conflict);
        setStatus({
          kind: "error",
          text: res.conflict ? t("claudeSettings.conflictOnDisk") : res.error ?? t("claudeSettings.saveFailed"),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const fileInfo = (s: ClaudeSettingsScope) => files.find((f) => f.scope === s);
  const projectOptions =
    projectDir && !knownProjects.includes(projectDir) ? [projectDir, ...knownProjects] : knownProjects;

  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col border-border bg-bg-card text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-sm text-text-primary">{t("claudeSettings.title")}</DialogTitle>
        </DialogHeader>

        {/* Scope + project */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist">
            {CLAUDE_SETTINGS_SCOPES.map((s) => {
              const info = fileInfo(s);
              const active = s === scope;
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => chooseScope(s)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                    active
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-text-secondary hover:border-accent hover:text-text-primary"
                  }`}
                >
                  {t(SCOPE_LABEL_KEY[s])}
                  {info && (
                    <span
                      className={`size-1.5 rounded-full ${info.exists ? "bg-ok" : "bg-text-tertiary/50"}`}
                      title={info.exists ? t("claudeSettings.fileExists") : t("claudeSettings.fileMissing")}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {needsProject && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-text-secondary">{t("claudeSettings.project")}</span>
              <select
                value={projectDir}
                onChange={(e) => chooseProject(e.target.value)}
                className={`${selectClass} min-w-0 max-w-full flex-1 font-mono`}
              >
                <option value="">{t("claudeSettings.project.choose")}</option>
                {projectOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={() => void browse()}>
                <FolderOpen aria-hidden /> {t("claudeSettings.project.browse")}
              </Button>
            </div>
          )}
          {file?.path && (
            <p className="flex flex-wrap items-center gap-2 break-all font-mono text-xs text-text-secondary">
              {file.path}
              <span className={`font-sans ${file.exists ? "text-ok" : "text-text-tertiary"}`}>
                {file.exists ? t("claudeSettings.fileExists") : t("claudeSettings.fileMissingWillCreate")}
              </span>
            </p>
          )}
        </div>

        {/* Body */}
        <div className="min-h-[280px] flex-1 overflow-y-auto pr-1">
          {needsProject && !projectDir ? (
            <EmptyState
              icon={<FolderOpen aria-hidden className="size-6 text-text-tertiary" />}
              title={t("claudeSettings.project.required")}
              description={t("claudeSettings.project.requiredHint")}
              action={
                <Button size="sm" onClick={() => void browse()}>
                  <FolderOpen aria-hidden /> {t("claudeSettings.project.browse")}
                </Button>
              }
            />
          ) : loading && !file ? (
            <div className="py-12 text-center text-sm text-text-secondary">{t("configEditor.loading")}</div>
          ) : file && !file.ok ? (
            <p className="flex items-center justify-center gap-1.5 py-12 text-sm text-fail">
              <XCircle aria-hidden className="size-4 shrink-0" /> {file.error}
            </p>
          ) : invalidJson && file ? (
            <EmptyState
              icon={<AlertTriangle aria-hidden className="size-6 text-warn" />}
              title={t("claudeSettings.invalidJson")}
              description={
                <span className="break-all font-mono text-xs">{invalidJson}</span>
              }
              action={
                <Button size="sm" onClick={() => requestRaw(file.path)}>
                  <FileCode2 aria-hidden /> {t("claudeSettings.openRaw")}
                </Button>
              }
            />
          ) : preview ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-secondary">{t("claudeSettings.preview.hint")}</p>
              {preview.lines ? (
                <DiffPreview lines={preview.lines} />
              ) : (
                <pre className="max-h-[50vh] overflow-auto rounded-md border border-border bg-bg-primary p-2 font-mono text-[11px]">
                  {preview.next}
                </pre>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-1 border-b border-border" role="tablist">
                {(["permissions", "hooks"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs ${
                      tab === k
                        ? "border-accent text-accent"
                        : "border-transparent text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {k === "permissions" ? (
                      <ShieldCheck aria-hidden className="size-3.5" />
                    ) : (
                      <Webhook aria-hidden className="size-3.5" />
                    )}
                    {k === "permissions" ? t("claudeSettings.tab.permissions") : t("claudeSettings.tab.hooks")}
                  </button>
                ))}
              </div>
              {tab === "permissions" ? (
                <PermissionsEditor draft={draft} onChange={update} />
              ) : (
                <HooksEditor draft={draft} onChange={update} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="min-w-0 flex-1 text-xs">
            {status ? (
              <span className={status.kind === "ok" ? "text-ok" : "text-fail"}>{status.text}</span>
            ) : (
              <span className="text-text-tertiary">{t("claudeSettings.footerNote")}</span>
            )}
            {conflict && (
              <Button size="sm" variant="ghost" className="ml-2 min-h-7 text-xs" onClick={() => void load()}>
                <RefreshCw aria-hidden /> {t("claudeSettings.reload")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {file?.path && file.exists && !preview && (
              <Button size="sm" variant="ghost" onClick={() => requestRaw(file.path)}>
                <FileCode2 aria-hidden /> {t("claudeSettings.openRaw")}
              </Button>
            )}
            {preview ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={saving}>
                  {t("claudeSettings.preview.back")}
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={saving}>
                  <ArrowRight aria-hidden />
                  {saving ? t("configEditor.saving") : t("claudeSettings.preview.confirm")}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={requestClose}>
                  {t("configEditor.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={openPreview}
                  disabled={!canSave}
                  title={!canSave ? t("configEditor.noChanges") : undefined}
                >
                  {file && !file.exists ? t("claudeSettings.createAndSave") : t("claudeSettings.reviewSave")}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
