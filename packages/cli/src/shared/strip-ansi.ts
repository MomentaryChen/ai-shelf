/** Strip common ANSI escape sequences for read-only preview (not a full terminal parser). */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- matching ESC / BEL control bytes is the point
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}
