/** Platform hint for install commands in the renderer (Vite may externalize node:os). */
export function installPlatform(): NodeJS.Platform {
  if (typeof process !== "undefined" && process.platform) {
    return process.platform as NodeJS.Platform;
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Win/i.test(ua)) return "win32";
  if (/Mac/i.test(ua)) return "darwin";
  return "linux";
}
