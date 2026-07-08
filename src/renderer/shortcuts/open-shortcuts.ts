let openCheatsheet: (() => void) | null = null;

export function registerShortcutCheatsheetOpener(fn: (() => void) | null): void {
  openCheatsheet = fn;
}

export function openShortcutCheatsheet(): void {
  openCheatsheet?.();
}
