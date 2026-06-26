import { useCallback, useEffect, useState } from "react";
import type { ConfigSnapshotDiffResult, ConfigSnapshotSummary } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { DataTable, Td } from "./DataTable";
import { useLocale } from "../i18n/LocaleProvider";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const STATUS_VARIANT: Record<string, "ok" | "fail" | "warn" | "info" | "neutral"> = {
  added: "ok",
  removed: "fail",
  modified: "warn",
  unchanged: "neutral",
};

export function ConfigSnapshotPanel({ onRestored }: { onRestored?: () => void }) {
  const { t } = useLocale();
  const [snapshots, setSnapshots] = useState<ConfigSnapshotSummary[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [diffA, setDiffA] = useState("");
  const [diffB, setDiffB] = useState("");
  const [diffResult, setDiffResult] = useState<ConfigSnapshotDiffResult | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const refresh = useCallback(async () => {
    const res = await window.api.configSnapshotList();
    if (res.success) setSnapshots(res.snapshots);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (snapshots.length >= 2 && !diffA && !diffB) {
      setDiffA(snapshots[1]!.id);
      setDiffB(snapshots[0]!.id);
    }
  }, [snapshots, diffA, diffB]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const createSnapshot = () =>
    run("create", async () => {
      const res = await window.api.configSnapshotCreate(label);
      if (res.success) {
        setLabel("");
        setMessage({
          kind: "ok",
          text: t("configSnapshot.created", {
            label: res.snapshot.label,
            files: res.snapshot.fileCount,
            skills: res.snapshot.skillCount,
          }),
        });
        await refresh();
      } else {
        setMessage({ kind: "err", text: res.error ?? t("configSnapshot.error") });
      }
    });

  const restore = (id: string) =>
    run(`restore-${id}`, async () => {
      if (!window.confirm(t("configSnapshot.restoreConfirm"))) return;
      const res = await window.api.configSnapshotRestore(id);
      if (res.success) {
        setMessage({ kind: "ok", text: t("configSnapshot.restored") });
        onRestored?.();
      } else {
        setMessage({ kind: "err", text: res.error ?? t("configSnapshot.error") });
      }
    });

  const remove = (id: string) =>
    run(`delete-${id}`, async () => {
      if (!window.confirm(t("configSnapshot.deleteConfirm"))) return;
      const res = await window.api.configSnapshotDelete(id);
      if (res.success) {
        await refresh();
        setDiffResult(null);
      } else {
        setMessage({ kind: "err", text: res.error ?? t("configSnapshot.error") });
      }
    });

  const exportBundle = (id: string) =>
    run(`export-${id}`, async () => {
      const res = await window.api.configSnapshotExport(id);
      if (res.success) {
        setMessage({ kind: "ok", text: t("configSnapshot.exported", { path: res.path }) });
      } else if (!res.canceled) {
        setMessage({ kind: "err", text: res.error ?? t("configSnapshot.error") });
      }
    });

  const importBundle = () =>
    run("import", async () => {
      const res = await window.api.configSnapshotImport(label);
      if (res.success) {
        setMessage({ kind: "ok", text: t("configSnapshot.imported") });
        await refresh();
      } else if (!res.canceled) {
        setMessage({ kind: "err", text: res.error ?? t("configSnapshot.error") });
      }
    });

  const compare = () =>
    run("diff", async () => {
      if (!diffA || !diffB || diffA === diffB) {
        setMessage({ kind: "err", text: t("configSnapshot.diffPickTwo") });
        return;
      }
      const res = await window.api.configSnapshotDiff(diffA, diffB);
      if (res.success) {
        setDiffResult(res.diff);
      } else {
        setMessage({ kind: "err", text: res.error ?? t("configSnapshot.error") });
      }
    });

  const visibleDiffItems =
    diffResult?.items.filter((item) => showUnchanged || item.status !== "unchanged") ?? [];

  return (
    <Card className="mb-4" title={t("configSnapshot.title")}>
      <p className="mb-3 text-[13px] leading-snug text-text-secondary">{t("configSnapshot.hint")}</p>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-xs text-text-tertiary">{t("configSnapshot.label")}</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("configSnapshot.labelPlaceholder")}
            className="rounded border border-border bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void createSnapshot()}
          className="rounded border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {busy === "create" ? "…" : t("configSnapshot.create")}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void importBundle()}
          className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {busy === "import" ? "…" : t("configSnapshot.import")}
        </button>
      </div>

      {snapshots.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("configSnapshot.empty")}</p>
      ) : (
        <DataTable headers={[t("configSnapshot.colLabel"), t("configSnapshot.colWhen"), "Files", "Skills", ""]}>
          {snapshots.map((s) => (
            <tr key={s.id}>
              <Td>{s.label}</Td>
              <Td>
                <span className="text-xs text-text-secondary">{formatWhen(s.createdAt)}</span>
              </Td>
              <Td>{s.fileCount}</Td>
              <Td>{s.skillCount}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void restore(s.id)}
                    className="whitespace-nowrap rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {busy === `restore-${s.id}` ? "…" : t("configSnapshot.restore")}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void exportBundle(s.id)}
                    className="whitespace-nowrap rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {busy === `export-${s.id}` ? "…" : t("configSnapshot.export")}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void remove(s.id)}
                    className="whitespace-nowrap rounded border border-border px-2 py-0.5 text-xs text-fail hover:border-fail disabled:opacity-50"
                  >
                    {busy === `delete-${s.id}` ? "…" : t("configSnapshot.delete")}
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}

      {snapshots.length >= 2 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {t("configSnapshot.diffTitle")}
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <select
              value={diffA}
              onChange={(e) => setDiffA(e.target.value)}
              className="rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary"
            >
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({formatWhen(s.createdAt)})
                </option>
              ))}
            </select>
            <span className="text-xs text-text-tertiary">→</span>
            <select
              value={diffB}
              onChange={(e) => setDiffB(e.target.value)}
              className="rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary"
            >
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({formatWhen(s.createdAt)})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void compare()}
              className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy === "diff" ? "…" : t("configSnapshot.compare")}
            </button>
            <label className="flex items-center gap-1 text-xs text-text-tertiary">
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
              />
              {t("configSnapshot.showUnchanged")}
            </label>
          </div>

          {diffResult && (
            <div className="max-h-64 overflow-auto rounded border border-border bg-bg-primary p-2">
              {visibleDiffItems.length === 0 ? (
                <p className="text-xs text-text-tertiary">{t("configSnapshot.diffNone")}</p>
              ) : (
                <ul className="space-y-2">
                  {visibleDiffItems.map((item) => (
                    <li key={item.archiveKey} className="text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge text={item.status} variant={STATUS_VARIANT[item.status] ?? "neutral"} />
                        <Badge text={item.kind} variant="info" />
                        <span className="break-all font-mono text-text-secondary">{item.archiveKey}</span>
                      </div>
                      {item.preview && (
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-bg-card p-2 font-mono text-[11px] text-text-secondary">
                          {item.preview}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {message && (
        <p
          className={`mt-3 text-xs ${message.kind === "ok" ? "text-ok" : "text-fail"}`}
          role="status"
        >
          {message.text}
        </p>
      )}
    </Card>
  );
}
