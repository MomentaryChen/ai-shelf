import { useCallback, useEffect, useState } from "react";
import type { McpListResult, McpServerRecord } from "../types";
import { Button } from "./Button";
import { useLocale } from "../i18n/LocaleProvider";
import { ConfigFileEditorModal } from "./ConfigFileEditorModal";
import { McpServerEditorModal } from "./McpServerEditorModal";

/** Interactive add / edit / enable-disable / delete for one tool's MCP servers. */
export function McpServerManager({ tool }: { tool: string }) {
  const { t } = useLocale();
  const [list, setList] = useState<McpListResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<McpServerRecord | "new" | null>(null);
  const [rawEdit, setRawEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await window.api.mcpListServers(tool);
      setList(res);
    } catch (err) {
      console.error("[McpServerManager] load error:", err);
    }
  }, [tool]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!list) return null;

  const toggle = async (rec: McpServerRecord) => {
    setBusy(rec.name);
    setError(null);
    const res = await window.api.mcpSetServerEnabled(tool, rec.name, !rec.enabled);
    setBusy(null);
    if (res.success) await load();
    else setError(res.error ?? "Failed to update");
  };

  const remove = async (name: string) => {
    setBusy(name);
    setError(null);
    const res = await window.api.mcpDeleteServer(tool, name);
    setBusy(null);
    setConfirmDelete(null);
    if (res.success) await load();
    else setError(res.error ?? "Failed to delete");
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-primary/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          {t("mcpManage.title")}
        </span>
        <div className="flex gap-2">
          {list.configPath && (
            <Button size="sm" variant="ghost" onClick={() => setRawEdit(true)}>
              📝 {t("mcpManage.editRaw")}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            ＋ {t("mcpManage.add")}
          </Button>
        </div>
      </div>

      {error && <p className="mb-2 break-all text-xs text-fail">❌ {error}</p>}

      {list.servers.length === 0 ? (
        <p className="py-1 text-[13px] text-text-tertiary">{t("mcpManage.none")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {list.servers.map((rec) => (
            <div
              key={rec.name}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                rec.enabled ? "bg-bg-secondary" : "bg-bg-secondary/40 opacity-70"
              }`}
            >
              <span className="font-mono text-[13px] text-text-primary">🔌 {rec.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  rec.enabled ? "bg-ok/15 text-ok" : "bg-text-tertiary/15 text-text-tertiary"
                }`}
              >
                {rec.enabled ? t("mcpManage.enabled") : t("mcpManage.disabled")}
              </span>

              <div className="ml-auto flex items-center gap-1">
                {confirmDelete === rec.name ? (
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy === rec.name}
                      onClick={() => remove(rec.name)}
                    >
                      {t("mcpManage.confirm")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      {t("mcpManage.cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === rec.name}
                      onClick={() => toggle(rec)}
                    >
                      {rec.enabled ? t("mcpManage.disabled") : t("mcpManage.enabled")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(rec)}>
                      {t("mcpManage.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmDelete(rec.name)}
                      title={t("mcpManage.confirmDelete", { name: rec.name })}
                    >
                      {t("mcpManage.delete")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <McpServerEditorModal
          tool={tool}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      {rawEdit && list.configPath && (
        <ConfigFileEditorModal
          path={list.configPath}
          onClose={() => setRawEdit(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
