/** Last path segment for compact pane / session labels. */
export function formatPaneCwdShort(cwd: string): string {
  const t = cwd.trim();
  if (!t) return "";
  const normalized = t.replace(/[/\\]+$/, "");
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || normalized;
}
