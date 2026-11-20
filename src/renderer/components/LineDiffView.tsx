import type { DiffLine } from "../utils/diff-tools";

function lineTone(type: DiffLine["type"]): string {
  if (type === "add") return "bg-ok/12 text-ok";
  if (type === "remove") return "bg-fail/12 text-fail";
  return "text-text-secondary";
}

function linePrefix(type: DiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "remove") return "−";
  return " ";
}

/** Unified line diff with left/right line numbers (output of `computeLineDiff`). */
export function LineDiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="m-0 p-0 font-mono text-[12px] leading-relaxed">
      {lines.map((line, idx) => (
        <div
          key={`${line.type}-${line.leftNo ?? "x"}-${line.rightNo ?? "x"}-${idx}`}
          className={`flex gap-2 whitespace-pre-wrap break-all px-3 py-0.5 ${lineTone(line.type)}`}
        >
          <span className="w-10 shrink-0 select-none text-right tabular-nums text-text-tertiary">
            {line.leftNo ?? ""}
          </span>
          <span className="w-10 shrink-0 select-none text-right tabular-nums text-text-tertiary">
            {line.rightNo ?? ""}
          </span>
          <span className="w-3 shrink-0 select-none">{linePrefix(line.type)}</span>
          <span className="min-w-0 flex-1">{line.text.length ? line.text : " "}</span>
        </div>
      ))}
    </pre>
  );
}
