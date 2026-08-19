import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Network, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocale } from "../i18n/LocaleProvider";
import {
  COMMON_DEV_PORTS,
  parsePortQuery,
  type PortListenerRow,
} from "../../shared/port-listeners.js";
import { Card } from "./Card";
import { ConfirmDialog } from "./ConfirmDialog";
import { SectionHeading } from "./SectionHeading";

const PORTS_POLL_MS = 5_000;

const monoInputClass =
  "h-10 border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary";

const headClass =
  "normal-case tracking-normal text-[12px] font-medium text-text-secondary";

function formatAddress(address: string, port: number): string {
  if (address.includes(":")) return `[${address}]:${port}`;
  return `${address}:${port}`;
}

export function PortsToolsTab({ active = true }: { active?: boolean }) {
  const { t } = useLocale();
  const portId = useId();
  const [input, setInput] = useState("3000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listeners, setListeners] = useState<PortListenerRow[]>([]);
  const [queriedPort, setQueriedPort] = useState<number | null>(3000);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [pendingKill, setPendingKill] = useState<PortListenerRow | null>(null);
  const requestIdRef = useRef(0);
  const queryRef = useRef("3000");

  const lookup = useCallback(async (raw: string, opts?: { silent?: boolean }) => {
    const parsed = parsePortQuery(raw);
    if (!parsed.ok) {
      if (!opts?.silent) {
        setError(t("ports.error.invalidPort"));
        setListeners([]);
      }
      return;
    }
    if (!window.api?.portsList) {
      if (!opts?.silent) {
        setError(t("ports.error.unavailable"));
        setListeners([]);
      }
      return;
    }

    queryRef.current = raw;
    const id = opts?.silent ? requestIdRef.current : ++requestIdRef.current;
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await window.api.portsList(parsed.port);
      if (id !== requestIdRef.current) return;
      if (!result.ok) {
        if (!opts?.silent) {
          setListeners([]);
          setError(result.error || t("ports.error.listFailed"));
        }
        return;
      }
      setQueriedPort(result.port);
      setListeners(result.listeners);
      setError(null);
    } catch (err) {
      if (id !== requestIdRef.current) return;
      if (!opts?.silent) {
        setListeners([]);
        setError(err instanceof Error ? err.message : t("ports.error.listFailed"));
      }
    } finally {
      if (id === requestIdRef.current && !opts?.silent) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let inFlight = false;

    const tick = async (silent: boolean) => {
      if (cancelled || inFlight || (silent && document.hidden)) return;
      inFlight = true;
      try {
        await lookup(queryRef.current, { silent });
      } finally {
        inFlight = false;
      }
    };

    void tick(false);
    const timer = window.setInterval(() => {
      void tick(true);
    }, PORTS_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void tick(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, lookup]);

  const submit = () => {
    void lookup(input);
  };

  const showAll = () => {
    setInput("");
    void lookup("");
  };

  const pickPort = (port: number) => {
    const next = String(port);
    setInput(next);
    void lookup(next);
  };

  const requestStop = (row: PortListenerRow) => {
    if (!row.canKill || killingPid != null) return;
    setPendingKill(row);
  };

  const stopProcess = async (row: PortListenerRow) => {
    if (!window.api?.portsKill) {
      setError(t("ports.error.unavailable"));
      return;
    }
    setKillingPid(row.pid);
    setError(null);
    try {
      const result = await window.api.portsKill(row.pid);
      if (!result.ok) {
        setError(result.error || t("ports.error.killFailed"));
        return;
      }
      await lookup(queryRef.current, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ports.error.killFailed"));
    } finally {
      setKillingPid(null);
    }
  };

  const countLabel =
    queriedPort == null
      ? t("ports.count.all", { count: listeners.length })
      : t("ports.count.port", { count: listeners.length, port: queriedPort });

  return (
    <>
      <SectionHeading icon={Network}>{t("tools.tab.ports")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("ports.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={portId} className="text-[12px] font-medium text-text-secondary">
              {t("ports.port")}
            </Label>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Input
                id={portId}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                inputMode="numeric"
                spellCheck={false}
                placeholder={t("ports.portPlaceholder")}
                className={`${monoInputClass} min-w-[8rem] max-w-[12rem]`}
              />
              <Button type="submit" size="sm" disabled={loading} className="h-10 px-4">
                {t("ports.lookup")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading}
                className="h-10 px-3"
                onClick={() => void lookup(input)}
                title={t("ports.refresh")}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden @sm:inline">{t("ports.refresh")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                className="h-10 px-3"
                onClick={showAll}
              >
                {t("ports.all")}
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {COMMON_DEV_PORTS.map((port) => {
              const active = queriedPort === port && input.trim() === String(port);
              return (
                <Button
                  key={port}
                  type="button"
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  disabled={loading}
                  className="h-9 px-3 font-mono text-[12px] tabular-nums"
                  onClick={() => pickPort(port)}
                >
                  {port}
                </Button>
              );
            })}
          </div>

          <p className="text-[12px] text-text-secondary">{loading ? t("ports.looking") : countLabel}</p>

          {error && (
            <p className="text-[13px] leading-relaxed text-text-primary" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && listeners.length === 0 && (
            <p className="text-[13px] leading-relaxed text-text-secondary">
              {queriedPort == null ? t("ports.empty.all") : t("ports.empty.port", { port: queriedPort })}
            </p>
          )}

          {listeners.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={headClass}>{t("ports.col.process")}</TableHead>
                  <TableHead className={headClass}>{t("ports.col.pid")}</TableHead>
                  <TableHead className={headClass}>{t("ports.col.proto")}</TableHead>
                  <TableHead className={headClass}>{t("ports.col.address")}</TableHead>
                  <TableHead className={`${headClass} text-right`}>{t("ports.col.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listeners.map((row) => {
                  const key = `${row.protocol}-${row.address}-${row.port}-${row.pid}`;
                  const stopping = killingPid === row.pid;
                  return (
                    <TableRow key={key}>
                      <TableCell className="max-w-[12rem] truncate font-medium text-text-primary">
                        {row.processName}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-text-primary">{row.pid}</TableCell>
                      <TableCell className="text-text-secondary">{row.protocol}</TableCell>
                      <TableCell className="font-mono text-[12px] text-text-primary">
                        {formatAddress(row.address, row.port)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!row.canKill || killingPid != null}
                          className="h-9 px-3 text-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title={row.canKill ? t("ports.stop") : t("ports.stopProtected")}
                          onClick={() => requestStop(row)}
                        >
                          <Unplug className="h-3.5 w-3.5" />
                          <span className="hidden @sm:inline">
                            {stopping ? t("ports.stopping") : t("ports.stop")}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={pendingKill !== null}
        title={t("ports.killTitle")}
        description={t("ports.killConfirm", {
          name: pendingKill?.processName ?? "",
          pid: pendingKill?.pid ?? "",
          port: pendingKill?.port ?? "",
        })}
        confirmLabel={t("ports.stop")}
        confirmVariant="destructive"
        onCancel={() => setPendingKill(null)}
        onConfirm={() => {
          const row = pendingKill;
          setPendingKill(null);
          if (row) void stopProcess(row);
        }}
      />
    </>
  );
}
