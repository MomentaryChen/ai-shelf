import type { ProviderEntry } from "../types";
import { InstallStatusBadge } from "./Badge";
import { toolIcon, toolLabel } from "../utils";

export function ToolNameCell({ entry }: { entry: ProviderEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <span className={entry.available ? "" : "opacity-50 grayscale"}>{toolIcon(entry.tool)}</span>
      <strong className={entry.available ? "text-text-primary" : "text-text-tertiary"}>
        {toolLabel(entry.tool)}
      </strong>
      <InstallStatusBadge available={entry.available} />
    </div>
  );
}
