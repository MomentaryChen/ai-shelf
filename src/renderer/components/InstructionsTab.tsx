import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  FilePlus2,
  FileText,
  FolderOpen,
  GitCompare,
  Pencil,
  RefreshCw,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import {
  cursorRuleFileName,
  cursorRuleNameForSource,
  instructionRefKey,
  type InstructionApplyResultItem,
  type InstructionFileInfo,
  type InstructionPreviewItem,
  type InstructionRef,
  type InstructionScanResult,
} from "../../shared/instruction-files.js";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "../i18n/LocaleProvider";
import { computeLineDiff, MAX_DIFF_LINES } from "../utils/diff-tools";
import { toolLabel } from "../utils";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { ConfigFileEditorModal } from "./ConfigFileEditorModal";
import { EmptyState } from "./EmptyState";
import { InstructionSyncPreviewDialog } from "./InstructionSyncPreviewDialog";
import { LineDiffView } from "./LineDiffView";
import { SectionHeading } from "./SectionHeading";
import { StaggerStack } from "./StaggerStack";
import { ToolLogo } from "./ToolLogo";

const PROJECT_KEY = "aishelf.instructions.projectDir";

function loadStoredProject(): string | null | undefined {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (raw === null) return undefined;
    return raw === "" ? null : raw;
  } catch {
    return undefined;
  }
}

function storeProject(dir: string | null) {
  try {
    localStorage.setItem(PROJECT_KEY, dir ?? "");
  } catch {
    /* per-viewer convenience only */
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const keyOf = (f: InstructionFileInfo) => instructionRefKey(f.ref);

type EditState = { file: InstructionFileInfo; create: boolean };

function Readers({ tools }: { tools: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {tools.map((tool) => (
        <span
          key={tool}
          title={toolLabel(tool)}
          className="inline-flex items-center gap-1 rounded-md bg-bg-secondary px-1.5 py-0.5 text-[11px] text-text-secondary"
        >
          <ToolLogo tool={tool} size={11} />
          {toolLabel(tool)}
        </span>
      ))}
    </span>
  );
}

function FileRow({
  file,
  compareChecked,
  onToggleCompare,
  onEdit,
}: {
  file: InstructionFileInfo;
  compareChecked: boolean;
  onToggleCompare: () => void;
  onEdit: (create: boolean) => void;
}) {
  const { t } = useLocale();
  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <Checkbox
        className="mt-0.5"
        checked={compareChecked}
        onCheckedChange={onToggleCompare}
        aria-label={t("instructions.compare.select", { name: file.label })}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-medium text-text-primary">{file.label}</span>
          {file.exists ? (
            <Badge
              text={`${formatSize(file.size ?? 0)} · ${
                file.mtimeMs ? new Date(file.mtimeMs).toLocaleString() : "—"
              }`}
              variant="ok"
              dot
            />
          ) : (
            <Badge text={t("instructions.status.missing")} variant="neutral" />
          )}
        </div>
        <button
          type="button"
          disabled={!file.exists}
          onClick={() => void window.api.openPath(file.path)}
          title={file.exists ? t("inventory.clickOpen") : undefined}
          className="mt-0.5 block max-w-full break-all text-left font-mono text-[11px] text-text-tertiary enabled:cursor-pointer enabled:hover:text-accent enabled:hover:underline"
        >
          {file.path}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
          <span>{t("instructions.readBy")}</span>
          <Readers tools={file.readers} />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={file.exists ? "ghost" : "outline"}
        className="h-7 px-2 text-[12px]"
        onClick={() => onEdit(!file.exists)}
      >
        {file.exists ? (
          <>
            <Pencil className="h-3.5 w-3.5" /> {t("configEditor.edit")}
          </>
        ) : (
          <>
            <FilePlus2 className="h-3.5 w-3.5" /> {t("instructions.create")}
          </>
        )}
      </Button>
    </li>
  );
}

function ComparePanel({
  projectDir,
  left,
  right,
  onSwap,
  onClear,
}: {
  projectDir: string | null;
  left: InstructionFileInfo | undefined;
  right: InstructionFileInfo | undefined;
  onSwap: () => void;
  onClear: () => void;
}) {
  const { t } = useLocale();
  const [texts, setTexts] = useState<{ left: string; right: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTexts(null);
    setError(null);
    if (!left || !right) return;
    let cancelled = false;
    void Promise.all([
      window.api.instructionsRead(projectDir, left.ref),
      window.api.instructionsRead(projectDir, right.ref),
    ]).then(([a, b]) => {
      if (cancelled) return;
      if (!a.success || !b.success) {
        setError(a.error ?? b.error ?? "");
        return;
      }
      setTexts({ left: a.content, right: b.content });
    });
    return () => {
      cancelled = true;
    };
  }, [projectDir, left, right]);

  const diff = useMemo(
    () => (texts ? computeLineDiff(texts.left, texts.right) : null),
    [texts],
  );

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-text-tertiary" aria-hidden />
          {t("instructions.compare.title")}
        </span>
      }
      trailing={
        left && right ? (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={onSwap}>
              <ArrowLeftRight className="h-3.5 w-3.5" /> {t("diff.swap")}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={onClear}>
              {t("diff.clear")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!left || !right ? (
        <p className="text-[13px] text-text-tertiary">{t("instructions.compare.hint")}</p>
      ) : (
        <>
          <div className="mb-2 grid gap-1 text-[12px] @md:grid-cols-2">
            <p className="min-w-0 break-all">
              <span className="text-fail">−</span>{" "}
              <span className="font-mono text-text-primary">{left.label}</span>
              {!left.exists && <span className="text-text-tertiary"> {t("instructions.compare.missing")}</span>}
            </p>
            <p className="min-w-0 break-all">
              <span className="text-ok">+</span>{" "}
              <span className="font-mono text-text-primary">{right.label}</span>
              {!right.exists && <span className="text-text-tertiary"> {t("instructions.compare.missing")}</span>}
            </p>
          </div>
          <div
            className="max-h-[420px] min-h-[80px] overflow-auto rounded-[22px] border border-border bg-bg-primary"
            role="region"
            aria-label={t("diff.result")}
          >
            {error !== null && (
              <p className="px-3 py-3 text-[13px] text-fail">{error || t("instructions.error.generic")}</p>
            )}
            {diff && !diff.ok && (
              <p className="px-3 py-3 text-[13px] text-fail">
                {t("diff.error.tooLarge", { max: MAX_DIFF_LINES })}
              </p>
            )}
            {diff?.ok && diff.result.identical && (
              <p className="px-3 py-3 text-[13px] text-ok">
                {texts && texts.left === texts.right
                  ? t("diff.identical")
                  : t("instructions.preview.whitespaceOnly")}
              </p>
            )}
            {diff?.ok && !diff.result.identical && (
              <>
                <p className="border-b border-border px-3 py-1.5 text-right text-[12px] tabular-nums text-text-tertiary">
                  {t("diff.stats", { added: diff.result.added, removed: diff.result.removed })}
                </p>
                <LineDiffView lines={diff.result.lines} />
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function SyncPanel({
  projectDir,
  files,
  onSynced,
}: {
  projectDir: string | null;
  files: InstructionFileInfo[];
  onSynced: () => void;
}) {
  const { t } = useLocale();
  const sources = files.filter((f) => f.exists);
  const [sourceKey, setSourceKey] = useState("");
  const [targetKeys, setTargetKeys] = useState<Set<string>>(new Set());
  const [newRule, setNewRule] = useState(false);
  const [previewItems, setPreviewItems] = useState<InstructionPreviewItem[] | null>(null);
  const [sourceFingerprint, setSourceFingerprint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InstructionApplyResultItem[] | null>(null);

  const source = sources.find((f) => keyOf(f) === sourceKey);
  const targets = files.filter((f) => keyOf(f) !== sourceKey);
  const newRuleName = source ? cursorRuleNameForSource(source.ref) : "rules.mdc";
  const newRuleTaken = files.some(
    (f) => f.ref.kindId === "cursor-rule" && f.ref.rulePath?.toLowerCase() === newRuleName.toLowerCase(),
  );

  // Drop a selection that no longer exists after a rescan / project switch.
  useEffect(() => {
    if (sourceKey && !sources.some((f) => keyOf(f) === sourceKey)) setSourceKey("");
  }, [sources, sourceKey]);

  const toggleTarget = (key: string) =>
    setTargetKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedTargets = (): InstructionRef[] => {
    const refs = targets.filter((f) => targetKeys.has(keyOf(f))).map((f) => f.ref);
    if (newRule && projectDir && !newRuleTaken) {
      refs.push({ kindId: "cursor-rule", rulePath: newRuleName });
    }
    return refs;
  };

  const requestPreview = async () => {
    if (!source) return;
    const refs = selectedTargets();
    if (refs.length === 0) return;
    setError(null);
    setResults(null);
    setBusy(true);
    try {
      const res = await window.api.instructionsPreviewSync(projectDir, { source: source.ref, targets: refs });
      if (!res.ok) {
        // Never fall back to writing without a preview.
        setError(res.error ?? t("instructions.error.generic"));
        return;
      }
      setSourceFingerprint(res.sourceFingerprint ?? "");
      setPreviewItems(res.items);
    } catch (err) {
      setError((err as Error).message || t("instructions.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!source || !previewItems) return;
    setBusy(true);
    try {
      const res = await window.api.instructionsApplySync(projectDir, {
        source: source.ref,
        sourceFingerprint,
        targets: previewItems.map((i) => ({ ref: i.ref, fingerprint: i.fingerprint })),
      });
      if (!res.ok) setError(res.error ?? t("instructions.error.generic"));
      else setResults(res.results);
      setPreviewItems(null);
      setTargetKeys(new Set());
      setNewRule(false);
      onSynced();
    } catch (err) {
      setError((err as Error).message || t("instructions.error.generic"));
      setPreviewItems(null);
    } finally {
      setBusy(false);
    }
  };

  const targetCount = selectedTargets().length;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-text-tertiary" aria-hidden />
          {t("instructions.sync.title")}
        </span>
      }
    >
      <p className="mb-3 text-[13px] text-text-secondary">{t("instructions.sync.hint")}</p>
      {sources.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">{t("instructions.sync.noSources")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="instr-sync-source" className="text-[12px] font-medium text-text-secondary">
              {t("instructions.sync.source")}
            </Label>
            <select
              id="instr-sync-source"
              value={sourceKey}
              onChange={(e) => {
                setSourceKey(e.target.value);
                setTargetKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(e.target.value);
                  return next;
                });
              }}
              className="h-8 min-w-0 max-w-full rounded-lg border border-border bg-bg-card px-2 font-mono text-[12.5px] text-text-primary"
            >
              <option value="">{t("instructions.sync.sourcePlaceholder")}</option>
              {sources.map((f) => (
                <option key={keyOf(f)} value={keyOf(f)}>
                  {f.scope === "global" ? f.label : `./${f.label}`}
                </option>
              ))}
            </select>
          </div>

          {source && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-text-secondary">{t("instructions.sync.targets")}</p>
              <div className="grid gap-1.5 @md:grid-cols-2">
                {targets.map((f) => (
                  <Label
                    key={keyOf(f)}
                    className="flex cursor-pointer items-center gap-2 text-[12.5px] font-normal text-text-primary"
                  >
                    <Checkbox checked={targetKeys.has(keyOf(f))} onCheckedChange={() => toggleTarget(keyOf(f))} />
                    <span className="min-w-0 truncate font-mono">
                      {f.scope === "global" ? f.label : `./${f.label}`}
                    </span>
                    {!f.exists && <span className="text-[11px] text-text-tertiary">{t("instructions.sync.willCreate")}</span>}
                  </Label>
                ))}
                {projectDir && !newRuleTaken && (
                  <Label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-normal text-text-primary">
                    <Checkbox checked={newRule} onCheckedChange={(v) => setNewRule(v === true)} />
                    <span className="min-w-0 truncate font-mono">./.cursor/rules/{newRuleName}</span>
                    <span className="text-[11px] text-text-tertiary">{t("instructions.sync.willCreate")}</span>
                  </Label>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void requestPreview()}
              disabled={busy || !source || targetCount === 0}
            >
              {t("instructions.sync.preview", { count: targetCount })}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 inline-flex items-start gap-1 text-[12px] text-fail">
          <XCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {results && (
        <ul className="mt-3 space-y-1 text-[12px]">
          {results.map((r) => (
            <li key={instructionRefKey(r.ref)} className="flex items-start gap-1.5 break-all">
              {r.status === "written" ? (
                <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
              ) : r.status === "skipped" ? (
                <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              ) : (
                <XCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fail" />
              )}
              <span className="text-text-secondary">
                {r.status === "written"
                  ? t("instructions.result.written", { path: r.path })
                  : r.status === "skipped"
                    ? t("instructions.result.skipped", { path: r.path })
                    : r.status === "stale"
                      ? t("instructions.result.stale", { path: r.path })
                      : t("instructions.result.error", { path: r.path, error: r.error ?? "" })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <InstructionSyncPreviewDialog
        open={previewItems !== null}
        sourceLabel={source?.path ?? ""}
        items={previewItems ?? []}
        applying={busy}
        onConfirm={() => void apply()}
        onCancel={() => setPreviewItems(null)}
      />
    </Card>
  );
}

export function InstructionsTab() {
  const { t } = useLocale();
  const [projectDir, setProjectDir] = useState<string | null | undefined>(undefined);
  const [scan, setScan] = useState<InstructionScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [ruleName, setRuleName] = useState("");

  // Resolve the initial project: last choice, else the app's working directory.
  useEffect(() => {
    const stored = loadStoredProject();
    if (stored !== undefined) {
      setProjectDir(stored);
      return;
    }
    void window.api
      .instructionsDefaultProject()
      .then((dir) => setProjectDir(dir))
      .catch(() => setProjectDir(null));
  }, []);

  const rescan = useCallback(async () => {
    if (projectDir === undefined) return;
    setLoading(true);
    try {
      setScan(await window.api.instructionsScan(projectDir));
    } finally {
      setLoading(false);
    }
  }, [projectDir]);

  useEffect(() => {
    void rescan();
  }, [rescan]);

  const files = scan?.files ?? [];
  const byKey = useMemo(() => new Map(files.map((f) => [keyOf(f), f])), [files]);

  // Forget compare picks that vanished after a rescan.
  useEffect(() => {
    setCompare((prev) => prev.filter((k) => byKey.has(k)));
  }, [byKey]);

  const changeProject = (dir: string | null) => {
    storeProject(dir);
    setProjectDir(dir);
    setCompare([]);
  };

  const chooseProject = async () => {
    const dir = await window.api.pickFolder(projectDir ?? undefined);
    if (dir) changeProject(dir);
  };

  const toggleCompare = (key: string) =>
    setCompare((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      // Keep at most two: the newest pick replaces the oldest.
      return [...prev, key].slice(-2);
    });

  const global = files.filter((f) => f.scope === "global");
  const project = files.filter((f) => f.scope === "project");
  const hasRules = project.some((f) => f.kindId === "cursor-rule");

  const createRule = () => {
    const rulePath = cursorRuleFileName(ruleName || "rules");
    const existing = byKey.get(instructionRefKey({ kindId: "cursor-rule", rulePath }));
    setEdit({
      create: !existing,
      file: existing ?? {
        ref: { kindId: "cursor-rule", rulePath },
        kindId: "cursor-rule",
        scope: "project",
        path: `${scan?.cursorRulesDir ?? ".cursor/rules"}/${rulePath}`,
        label: `.cursor/rules/${rulePath}`,
        readers: ["cursor"],
        exists: false,
        size: null,
        mtimeMs: null,
      },
    });
    setRuleName("");
  };

  const renderRows = (list: InstructionFileInfo[]) => (
    <ul>
      {list.map((f) => (
        <FileRow
          key={keyOf(f)}
          file={f}
          compareChecked={compare.includes(keyOf(f))}
          onToggleCompare={() => toggleCompare(keyOf(f))}
          onEdit={(create) => setEdit({ file: f, create })}
        />
      ))}
    </ul>
  );

  return (
    <>
      <SectionHeading icon={FileText}>{t("app.tab.instructions")}</SectionHeading>
      <StaggerStack>
        <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
          {t("instructions.subtitle")}
        </p>

        <Card dense>
          <div className="flex flex-wrap items-center gap-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
            <span className="text-[12px] font-medium text-text-secondary">{t("instructions.project.label")}</span>
            <span className="min-w-0 flex-1 break-all font-mono text-[12px] text-text-primary">
              {projectDir ?? <span className="text-text-tertiary">{t("instructions.project.none")}</span>}
            </span>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => void chooseProject()}>
              {t("instructions.project.choose")}
            </Button>
            {projectDir && (
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => changeProject(null)}>
                {t("instructions.project.clear")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[12px]"
              onClick={() => void rescan()}
              disabled={loading}
              title={t("instructions.refresh")}
              aria-label={t("instructions.refresh")}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {scan?.projectError && (
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-fail">
              <XCircle aria-hidden className="h-3.5 w-3.5" /> {scan.projectError}
            </p>
          )}
        </Card>

        <Card title={t("instructions.scope.global")}>{renderRows(global)}</Card>

        <Card title={t("instructions.scope.project")}>
          {!scan?.projectDir ? (
            <EmptyState
              compact
              icon={<FolderOpen className="h-6 w-6" />}
              title={t("instructions.project.none")}
              action={
                <Button type="button" size="sm" variant="outline" onClick={() => void chooseProject()}>
                  {t("instructions.project.choose")}
                </Button>
              }
            />
          ) : (
            <>
              {renderRows(project)}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                <span className="text-[12px] text-text-secondary">
                  {hasRules ? t("instructions.cursorRules.addMore") : t("instructions.cursorRules.none")}
                </span>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder={t("instructions.cursorRules.namePlaceholder")}
                  aria-label={t("instructions.cursorRules.namePlaceholder")}
                  className="h-7 w-44 font-mono text-[12px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createRule();
                  }}
                />
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={createRule}>
                  <FilePlus2 className="h-3.5 w-3.5" /> {t("instructions.cursorRules.add")}
                </Button>
              </div>
            </>
          )}
        </Card>

        <ComparePanel
          projectDir={scan?.projectDir ?? null}
          left={compare[0] ? byKey.get(compare[0]) : undefined}
          right={compare[1] ? byKey.get(compare[1]) : undefined}
          onSwap={() => setCompare((prev) => [...prev].reverse())}
          onClear={() => setCompare([])}
        />

        <SyncPanel projectDir={scan?.projectDir ?? null} files={files} onSynced={() => void rescan()} />
      </StaggerStack>

      {edit && (
        <ConfigFileEditorModal
          path={edit.file.path}
          title={edit.create ? t("instructions.createTitle") : t("instructions.editTitle")}
          initialContent={edit.create ? "" : undefined}
          read={() => window.api.instructionsRead(scan?.projectDir ?? null, edit.file.ref)}
          write={(content) => window.api.instructionsWrite(scan?.projectDir ?? null, edit.file.ref, content)}
          onClose={() => setEdit(null)}
          onSaved={() => void rescan()}
        />
      )}
    </>
  );
}
