import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Play } from "lucide-react";
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
import { useLocale } from "../i18n/LocaleProvider";
import type { TaskDef } from "../types";
import {
  fillTaskVariables,
  missingTaskVariables,
} from "../../shared/task-variables.js";

const fieldLabelClass = "mb-1.5 block font-mono text-[12px] font-medium text-chrome-text-secondary";
const hintClass = "mt-1 text-[11px] text-chrome-text-dim";
const inputClass =
  "border-chrome-border-subtle bg-chrome-bg text-[13px] text-chrome-text placeholder:text-chrome-text-dim";

/** Last values typed per task (custom variables and `file`), remembered in this browser only. */
const STORAGE_KEY = "ai-shelf.tasks.lastVariables";
/** Pre-filled each run instead of remembered: they describe the moment of the run. */
const FRESH = new Set(["branch", "selection"]);

function loadRemembered(taskId: string): Record<string, string> {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const entry = all && typeof all === "object" ? (all as Record<string, unknown>)[taskId] : null;
    if (!entry || typeof entry !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function remember(taskId: string, values: Record<string, string>): void {
  try {
    const all: Record<string, unknown> = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const kept: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (!FRESH.has(k.toLowerCase()) && v.length <= 4000) kept[k] = v;
    }
    all[taskId] = kept;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

export interface PendingVariableRun {
  task: TaskDef;
  names: string[];
  /** Folder the task will run in; used for `{{branch}}` and the file picker. Empty = unknown. */
  cwd: string;
}

/**
 * Asks for a task's `{{variables}}` before it runs. `branch` comes from git in the task's
 * folder, `selection` from the clipboard, `file` from a file picker; all stay editable.
 */
export function TaskVariablesDialog({
  pending,
  onCancel,
  onRun,
}: {
  pending: PendingVariableRun | null;
  onCancel: () => void;
  onRun: (task: TaskDef, values: Record<string, string>) => void;
}) {
  const { t } = useLocale();
  const [values, setValues] = useState<Record<string, string>>({});
  const [branchMissing, setBranchMissing] = useState(false);
  const [showError, setShowError] = useState(false);
  /** Keeps the last content while the dialog animates out. */
  const [shown, setShown] = useState<PendingVariableRun | null>(pending);
  const touched = useRef(new Set<string>());

  useEffect(() => {
    if (!pending) return;
    setShown(pending);
    setShowError(false);
    setBranchMissing(false);
    touched.current = new Set();
    const remembered = loadRemembered(pending.task.id);
    const initial: Record<string, string> = {};
    for (const name of pending.names) initial[name] = remembered[name] ?? "";
    setValues(initial);

    let cancelled = false;
    // Auto-fill only fields the user has not typed into yet.
    const fill = (name: string, value: string) => {
      if (cancelled || touched.current.has(name)) return;
      setValues((v) => ({ ...v, [name]: value }));
    };
    for (const name of pending.names) {
      const key = name.toLowerCase();
      if (key === "branch") {
        if (!pending.cwd) {
          setBranchMissing(true);
          continue;
        }
        void window.api
          .gitCwdInfo(pending.cwd)
          .then((info) => {
            if (info?.branch) fill(name, info.branch);
            else if (!cancelled) setBranchMissing(true);
          })
          .catch(() => !cancelled && setBranchMissing(true));
      } else if (key === "selection") {
        void window.api
          .clipboardReadText()
          .then((text) => fill(name, text ?? ""))
          .catch(() => undefined);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const preview = useMemo(
    () => (shown ? fillTaskVariables(shown.task.prompt, values) : ""),
    [shown, values],
  );

  if (!shown) return null;
  const missing = missingTaskVariables(shown.names, values);

  const set = (name: string, value: string) => {
    touched.current.add(name);
    setValues((v) => ({ ...v, [name]: value }));
  };

  const submit = () => {
    if (missing.length > 0) {
      setShowError(true);
      return;
    }
    const filled: Record<string, string> = {};
    for (const name of shown.names) filled[name] = values[name] ?? "";
    remember(shown.task.id, filled);
    onRun(shown.task, filled);
  };

  const browse = async (name: string) => {
    const current = values[name]?.trim();
    const picked = await window.api.pickFile(current || shown.cwd || undefined).catch(() => null);
    if (picked) set(name, picked);
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className="flex max-h-[min(88vh,760px)] max-w-2xl flex-col gap-4"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t("tasks.vars.title", { name: shown.task.name })}</DialogTitle>
          <DialogDescription className="text-[12px]">{t("tasks.vars.desc")}</DialogDescription>
        </DialogHeader>

        <form
          className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {shown.names.map((name, i) => {
            const key = name.toLowerCase();
            const id = `task-var-${i}`;
            const value = values[name] ?? "";
            const invalid = showError && !value.trim();
            const multiline = key === "selection" || value.includes("\n");
            return (
              <div key={name}>
                <label htmlFor={id} className={fieldLabelClass}>
                  {`{{${name}}}`}
                </label>
                {multiline ? (
                  <Textarea
                    id={id}
                    autoFocus={i === 0}
                    value={value}
                    onChange={(e) => set(name, e.target.value)}
                    spellCheck={false}
                    aria-invalid={invalid}
                    className={`field-sizing-fixed min-h-[96px] resize-y font-mono text-[12px] ${inputClass}`}
                  />
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      autoFocus={i === 0}
                      value={value}
                      onChange={(e) => set(name, e.target.value)}
                      spellCheck={false}
                      aria-invalid={invalid}
                      className={inputClass}
                    />
                    {key === "file" && (
                      <Button type="button" variant="outline" size="sm" onClick={() => void browse(name)}>
                        <FolderOpen />
                        {t("tasks.vars.browse")}
                      </Button>
                    )}
                  </div>
                )}
                {key === "branch" && (
                  <p className={branchMissing && !value ? "mt-1 text-[11px] text-warn" : hintClass}>
                    {branchMissing && !value ? t("tasks.vars.branchUnknown") : t("tasks.vars.branchHint")}
                  </p>
                )}
                {key === "selection" && <p className={hintClass}>{t("tasks.vars.selectionHint")}</p>}
                {key === "file" && <p className={hintClass}>{t("tasks.vars.fileHint")}</p>}
              </div>
            );
          })}

          <div>
            <p className={fieldLabelClass.replace("font-mono ", "")}>{t("tasks.vars.preview")}</p>
            <pre className="max-h-48 overflow-auto rounded-md bg-chrome-bg px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-chrome-text-secondary">
              {preview}
            </pre>
          </div>

          {showError && missing.length > 0 && (
            <p role="alert" className="rounded-md bg-fail/10 px-3 py-2 text-[12px] text-fail">
              {t("tasks.vars.required")}
            </p>
          )}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("tasks.vars.cancel")}
          </Button>
          <Button type="button" variant="chromeSolid" size="sm" onClick={submit}>
            <Play className="fill-current" />
            {t("tasks.vars.run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
