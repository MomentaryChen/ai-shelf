import type { ProviderEntry } from "../types";

/** Installed tools first, then not installed; stable order within each group. */
export function sortByInstalled(data: ProviderEntry[]): ProviderEntry[] {
  return [...data].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.tool.localeCompare(b.tool);
  });
}

export function partitionByInstalled(data: ProviderEntry[]): {
  installed: ProviderEntry[];
  notInstalled: ProviderEntry[];
} {
  const installed: ProviderEntry[] = [];
  const notInstalled: ProviderEntry[] = [];
  for (const e of sortByInstalled(data)) {
    (e.available ? installed : notInstalled).push(e);
  }
  return { installed, notInstalled };
}

export function installedRowClass(available: boolean): string {
  return available ? "" : "opacity-50 bg-bg-secondary/25";
}

export function installedCardClass(available: boolean): string {
  return available ? "" : "opacity-60 border-dashed";
}
