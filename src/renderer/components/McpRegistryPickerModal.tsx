import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  McpRegistryInstallPreview,
  McpRegistryServerItem,
} from "../types";
import { useLocale } from "../i18n/LocaleProvider";

interface Props {
  tool: string;
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function McpRegistryPickerModal({ tool, existingNames, onClose, onSaved }: Props) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [servers, setServers] = useState<McpRegistryServerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<McpRegistryServerItem | null>(null);
  const [preview, setPreview] = useState<McpRegistryInstallPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [serverName, setServerName] = useState("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenRef = useRef(0);
  const previewGenRef = useRef(0);

  const fieldValue = (values: Record<string, string>, key: string, fallback?: string) =>
    (values[key] ?? fallback ?? "").trim();

  const loadServers = useCallback(
    async (opts: { search: string; cursor?: string; append?: boolean }) => {
      const gen = ++loadGenRef.current;
      const isAppend = opts.append ?? false;
      if (isAppend) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const res = await window.api.mcpRegistryList({
        search: opts.search || undefined,
        cursor: opts.cursor,
        limit: 20,
      });

      if (gen !== loadGenRef.current) return;

      if (isAppend) setLoadingMore(false);
      else setLoading(false);

      if (res.error) setError(res.error);
      setServers((prev) => (isAppend ? [...prev, ...res.servers] : res.servers));
      setNextCursor(res.nextCursor);
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadServers({ search });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, loadServers]);

  const selectServer = async (item: McpRegistryServerItem) => {
    const gen = ++previewGenRef.current;
    setSelected(item);
    setPreview(null);
    setPreviewLoading(true);
    setEnvValues({});
    setArgValues({});

    const res = await window.api.mcpRegistryPreview(tool, item.id);

    if (gen !== previewGenRef.current) return;

    setPreviewLoading(false);

    if ("error" in res) {
      setError(res.error);
      return;
    }

    setPreview(res);
    setServerName(res.suggestedName);
    setError(null);
  };

  const requiredEnvMissing =
    preview?.envVars.some(
      (v) => v.isRequired && !fieldValue(envValues, v.name, v.default),
    ) ?? false;
  const requiredArgsMissing =
    preview?.packageArgs.some(
      (a) => a.isRequired && !fieldValue(argValues, a.name, a.default),
    ) ?? false;
  const nameConflict = existingNames.includes(serverName.trim());
  const canAdd =
    !!preview &&
    !!serverName.trim() &&
    !nameConflict &&
    !requiredEnvMissing &&
    !requiredArgsMissing &&
    !saving;

  const addServer = async () => {
    if (!preview || !canAdd) return;
    setSaving(true);
    setError(null);

    const resolved = await window.api.mcpRegistryPreview(tool, preview.registryId, {
      env: envValues,
      packageArgs: argValues,
    });

    if ("error" in resolved) {
      setSaving(false);
      setError(resolved.error);
      return;
    }

    const res = await window.api.mcpUpsertServer(tool, serverName.trim(), resolved.entry, true);
    setSaving(false);

    if (res.success) {
      onSaved();
      onClose();
    } else {
      setError(res.error ?? "Failed to add server");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col border-border bg-bg-card text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-sm text-text-primary">
            {t("mcpRegistry.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("mcpRegistry.searchPlaceholder")}
            autoFocus
            className="border-border bg-bg-primary text-[13px]"
          />

          {error && <p className="break-all text-xs text-fail">❌ {error}</p>}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex min-h-0 flex-col rounded-lg border border-border bg-bg-primary/50">
              <div className="border-b border-border px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {t("mcpRegistry.listHeading")}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {loading && servers.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-text-tertiary">{t("mcpRegistry.loading")}</p>
                ) : servers.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-text-tertiary">{t("mcpRegistry.empty")}</p>
                ) : (
                  servers.map((item) => {
                    const installed = existingNames.some(
                      (n) => n === registryNameToLocalName(item.id) || n === item.id,
                    );
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void selectServer(item)}
                        className={`mb-1 w-full rounded-md px-2 py-2 text-left transition-colors ${
                          selected?.id === item.id
                            ? "bg-accent/15 ring-1 ring-accent/40"
                            : "hover:bg-bg-secondary"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-[13px] font-medium text-text-primary">
                            {item.title ?? registryNameToLocalName(item.id)}
                          </span>
                          <span
                            className={`ml-auto shrink-0 rounded px-1 py-0.5 text-[10px] uppercase ${
                              item.transport === "stdio"
                                ? "bg-ok/15 text-ok"
                                : "bg-accent/15 text-accent"
                            }`}
                          >
                            {item.transport}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-text-tertiary">
                          {item.description ?? item.id}
                        </p>
                        {installed && (
                          <p className="mt-1 text-[10px] text-ok">{t("mcpRegistry.alreadyAdded")}</p>
                        )}
                      </button>
                    );
                  })
                )}
                {nextCursor && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 w-full"
                    disabled={loadingMore}
                    onClick={() => void loadServers({ search, cursor: nextCursor, append: true })}
                  >
                    {loadingMore ? t("mcpRegistry.loading") : t("mcpRegistry.loadMore")}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col rounded-lg border border-border bg-bg-primary/50">
              <div className="border-b border-border px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {t("mcpRegistry.detailHeading")}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {!selected ? (
                  <p className="text-xs text-text-tertiary">{t("mcpRegistry.pickOne")}</p>
                ) : previewLoading ? (
                  <p className="text-xs text-text-tertiary">{t("mcpRegistry.loading")}</p>
                ) : preview ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">
                        {preview.title ?? preview.suggestedName}
                      </p>
                      {preview.description && (
                        <p className="mt-1 text-xs text-text-secondary">{preview.description}</p>
                      )}
                      <p className="mt-1 font-mono text-[10px] text-text-tertiary">
                        {preview.registryId}
                      </p>
                    </div>

                    <div>
                      <Label className="mb-1 text-xs text-text-secondary">
                        {t("mcpRegistry.serverName")}
                      </Label>
                      <Input
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        className="border-border bg-bg-primary text-[13px]"
                      />
                      {nameConflict && (
                        <p className="mt-1 text-xs text-fail">{t("mcpRegistry.nameConflict")}</p>
                      )}
                    </div>

                    {preview.packageArgs.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                          {t("mcpRegistry.packageArgs")}
                        </p>
                        {preview.packageArgs.map((arg) => (
                          <div key={arg.name}>
                            <Label className="mb-1 text-xs text-text-secondary">
                              {arg.name}
                              {arg.isRequired ? " *" : ""}
                            </Label>
                            <Input
                              type={arg.type === "number" ? "number" : "text"}
                              value={argValues[arg.name] ?? arg.default ?? ""}
                              onChange={(e) =>
                                setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
                              }
                              placeholder={arg.description}
                              className="border-border bg-bg-primary text-[13px]"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {preview.envVars.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                          {t("mcpRegistry.envVars")}
                        </p>
                        {preview.envVars.map((v) => (
                          <div key={v.name}>
                            <Label className="mb-1 text-xs text-text-secondary">
                              {v.name}
                              {v.isRequired ? " *" : ""}
                            </Label>
                            <Input
                              type={v.isSecret ? "password" : "text"}
                              value={envValues[v.name] ?? v.default ?? ""}
                              onChange={(e) =>
                                setEnvValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                              }
                              placeholder={v.description}
                              className="border-border bg-bg-primary text-[13px]"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                        {t("mcpRegistry.previewConfig")}
                      </p>
                      <pre className="max-h-32 overflow-auto rounded-md border border-border bg-bg-primary p-2 font-mono text-[10px] leading-relaxed text-text-secondary">
                        {JSON.stringify(preview.entry, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("mcpRegistry.cancel")}
          </Button>
          <Button size="sm" onClick={() => void addServer()} disabled={!canAdd}>
            {saving ? t("mcpRegistry.adding") : t("mcpRegistry.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function registryNameToLocalName(registryName: string): string {
  const slash = registryName.lastIndexOf("/");
  const base = slash >= 0 ? registryName.slice(slash + 1) : registryName;
  return base.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
