/**
 * Ring-buffer trace of the CJK input path, dumpable from DevTools:
 *
 *   copy(JSON.stringify(__aiShelfImeInputLog(), null, 2))
 *
 * Chinese typed into an AI CLI prompt sometimes goes missing around a window
 * switch. The failure has no repro that survives having a debugger attached,
 * and two attempts to fix it from source reading alone have missed, so this
 * records the sequence instead: focus, composition, keydown, and the bytes
 * xterm handed to the PTY. That is enough to separate three otherwise
 * indistinguishable stories — the composition never produced text, it produced
 * text xterm never emitted, or xterm emitted it and the PTY write was lost.
 *
 * Every byte typed into a terminal passes through here, including input the
 * terminal deliberately never echoes: sudo passwords, API keys pasted at a
 * login prompt. So the default records *shapes* — how many characters, which
 * named keys — and never the characters themselves. Content capture is a
 * deliberate, per-session opt-in for someone actively chasing the bug:
 *
 *   __aiShelfImeTraceContent(true)
 *
 * It clears the buffer on the way in and on the way out, so text can never be
 * read out of entries recorded before the operator asked for it.
 */

export type ImeInputKind =
  | "focus"
  | "blur"
  | "window-focus"
  | "window-blur"
  | "composition-start"
  | "composition-update"
  | "composition-end"
  | "keydown"
  | "data";

/** What a call site observed, before the content policy is applied. */
export interface ImeInputRecord {
  sessionId: string;
  kind: ImeInputKind;
  /** Composition text, or the bytes handed to the PTY. */
  data?: string;
  key?: string;
  keyCode?: number;
  isComposing?: boolean;
  /** False for events this app dispatched itself. */
  trusted?: boolean;
  /** xterm slices committed text out of the helper textarea. */
  textareaValue?: string;
}

export interface ImeInputLogEntry {
  at: string;
  sessionId: string;
  kind: ImeInputKind;
  /**
   * Named keys ("Enter", "Backspace", "Process") are structure and are kept;
   * a single printable character is content and is replaced by "<char>".
   */
  key?: string;
  keyCode?: number;
  isComposing?: boolean;
  trusted?: boolean;
  /** Character counts carry the diagnosis; the characters need not. */
  length?: number;
  textareaLength?: number;
  /** Present only while content capture is on. */
  text?: string;
  textareaText?: string;
}

const MAX_ENTRIES = 400;
/** Long transcripts make a dump unreadable; the tail is the part in play. */
const MAX_TEXT_CHARS = 64;

const entries: ImeInputLogEntry[] = [];
let captureContent = false;

/** Control characters are the point of a PTY trace — show them, don't eat them. */
const escape = (s: string): string =>
  s.replace(/[\x00-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);

const trim = (s: string): string =>
  s.length > MAX_TEXT_CHARS ? `…${escape(s.slice(-MAX_TEXT_CHARS))}` : escape(s);

export function recordImeInput(record: ImeInputRecord): void {
  const entry: ImeInputLogEntry = {
    at: new Date().toISOString(),
    sessionId: record.sessionId,
    kind: record.kind,
    keyCode: record.keyCode,
    isComposing: record.isComposing,
    trusted: record.trusted,
  };

  if (record.key !== undefined) {
    entry.key = record.key.length === 1 ? "<char>" : record.key;
  }
  if (record.data !== undefined) {
    entry.length = record.data.length;
    if (captureContent) entry.text = trim(record.data);
  }
  if (record.textareaValue !== undefined) {
    entry.textareaLength = record.textareaValue.length;
    if (captureContent) entry.textareaText = trim(record.textareaValue);
  }

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export function getImeInputLog(): ImeInputLogEntry[] {
  return entries.map((e) => ({ ...e }));
}

export function clearImeInputLog(): void {
  entries.length = 0;
}

/**
 * Turn capture of the typed characters themselves on or off.
 *
 * Clearing on both edges keeps the window closed: entries recorded before the
 * operator opted in never gain text, and entries recorded during the opt-in do
 * not outlive it.
 */
export function setImeTraceContent(on: boolean): boolean {
  clearImeInputLog();
  captureContent = on;
  return captureContent;
}

declare global {
  interface Window {
    __aiShelfImeInputLog?: () => ImeInputLogEntry[];
    __aiShelfClearImeInputLog?: () => void;
    __aiShelfImeTraceContent?: (on: boolean) => boolean;
  }
}

if (typeof window !== "undefined") {
  window.__aiShelfImeInputLog = getImeInputLog;
  window.__aiShelfClearImeInputLog = clearImeInputLog;
  window.__aiShelfImeTraceContent = setImeTraceContent;
}
