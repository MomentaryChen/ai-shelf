/** OS appearance signals used when locale/theme preference is "system". */

export function prefersDarkColorScheme(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Re-run when OS dark/light mode or UI language changes. */
export function subscribeSystemAppearance(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => onChange();
  mq.addEventListener("change", onScheme);
  window.addEventListener("languagechange", onScheme);

  return () => {
    mq.removeEventListener("change", onScheme);
    window.removeEventListener("languagechange", onScheme);
  };
}
