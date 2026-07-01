/** Pull a `.flow.md` document from Claude stdout (fenced block or raw frontmatter). */
export function extractFlowMarkdown(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced =
    /```(?:markdown|md)?\s*\r?\n([\s\S]*?)```/i.exec(trimmed) ??
    /```\s*\r?\n([\s\S]*?)```/.exec(trimmed);
  if (fenced?.[1]?.includes("---")) {
    return fenced[1].trim();
  }

  if (trimmed.startsWith("---")) {
    return trimmed;
  }

  const fmStart = trimmed.indexOf("---");
  if (fmStart >= 0) {
    const slice = trimmed.slice(fmStart);
    if (/^---\r?\n[\s\S]*?\r?\n---/.test(slice)) {
      return slice.trim();
    }
  }

  return null;
}
