import { useEffect, useState } from "react";
import type { DoctorResult, ProviderEntry } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { toolIcon, toolLabel } from "../utils";

export function DoctorTab({ data }: { data: ProviderEntry[] }) {
  const [results, setResults] = useState<Record<string, DoctorResult>>({});

  const toolIds = data.map((e) => e.tool).join("\0");

  useEffect(() => {
    setResults({});
    let cancelled = false;
    // Fire each tool check in parallel — cards update as each resolves
    void Promise.all(
      data.map(async ({ tool }) => {
        try {
          const res = await window.api.runDoctorTool(tool);
          if (!cancelled) setResults((prev) => ({ ...prev, [tool]: res }));
        } catch {
          if (!cancelled) {
            setResults((prev) => ({
              ...prev,
              [tool]: { tool, checks: [{ name: "error", status: "fail", detail: "Check failed unexpectedly" }] },
            }));
          }
        }
      }),
    );
    return () => { cancelled = true; };
  }, [toolIds]);

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🩺 Doctor</h2>

      {data.map(({ tool }) => {
        const r = results[tool];
        const passCount = r?.checks.filter((c) => c.status === "pass").length ?? 0;
        const total = r?.checks.length ?? 0;
        const allPass = r != null && passCount === total;

        return (
          <Card
            key={tool}
            title={<>{toolIcon(tool)} {toolLabel(tool)}</>}
            trailing={
              r ? (
                <Badge
                  text={`${passCount}/${total} passed`}
                  variant={allPass ? "ok" : "warn"}
                />
              ) : undefined
            }
          >
            {!r ? (
              <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
                Checking…
              </div>
            ) : (
              r.checks.map((c) => {
                const icon = c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : "⚠️";
                return (
                  <div key={c.detail} className="flex items-center gap-2 py-1.5 text-[13px]">
                    <span className="w-5 shrink-0 text-center">{icon}</span>
                    <span>{c.detail}</span>
                  </div>
                );
              })
            )}
          </Card>
        );
      })}
    </>
  );
}

