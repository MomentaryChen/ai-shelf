import { stripAnsi } from "../utils/strip-ansi";
import { writeClipboardText } from "./xterm-clipboard";

export type TerminalOutputExportResult =
  | { success: true; path: string }
  | { success: false; canceled?: true; error?: string };

/** Save the PTY output buffer tail to a user-chosen .log file. */
export async function exportTerminalOutput(
  sessionId: string,
  defaultName?: string,
): Promise<TerminalOutputExportResult> {
  return window.api.ptyExportOutput(sessionId, defaultName);
}

/** Copy plain-text output (ANSI stripped) for pasting into issues. */
export async function copyTerminalOutputForIssue(sessionId: string): Promise<boolean> {
  const { buffer } = await window.api.ptyGetOutputBuffer(sessionId);
  if (!buffer) return false;
  const text = stripAnsi(buffer);
  if (!text.trim()) return false;
  return writeClipboardText(text);
}
