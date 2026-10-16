import { ipcMain } from "electron";
import { platform } from "node:os";
import {
  decodeWslListOutput,
  normalizeDistroName,
  parseWslListVerbose,
  type WslDistro,
} from "../shared/wsl-paths.js";
import { runWsl } from "./wsl-exec.js";

async function listDistros(): Promise<
  | { ok: true; distros: WslDistro[]; platformSupported: true }
  | { ok: false; error: string; code?: "unsupported" | "missing" | "failed"; platformSupported: boolean }
> {
  if (platform() !== "win32") {
    return {
      ok: false,
      error: "WSL is only available on Windows.",
      code: "unsupported",
      platformSupported: false,
    };
  }

  // Prefer UTF-8 listing when the host supports it; fall back to raw UTF-16LE.
  const utf8 = await runWsl(["-l", "-v", "--utf8"], { encoding: "utf8" });
  if (utf8.ok) {
    const distros = parseWslListVerbose(String(utf8.stdout));
    if (distros.length > 0) return { ok: true, distros, platformSupported: true };
  }

  const raw = await runWsl(["-l", "-v"], { encoding: "buffer" });
  if (!raw.ok) {
    const missing =
      raw.code === "ENOENT" ||
      /not (found|recognized)|WSL|subsystem/iu.test(raw.error);
    return {
      ok: false,
      error: raw.error,
      code: missing ? "missing" : "failed",
      platformSupported: true,
    };
  }

  const text = decodeWslListOutput(raw.stdout as Buffer);
  const distros = parseWslListVerbose(text);
  return { ok: true, distros, platformSupported: true };
}

async function distroIp(distro: unknown): Promise<
  | { ok: true; ip: string; distro: string }
  | { ok: false; error: string; code?: "unsupported" | "missing" | "failed" | "invalid" }
> {
  if (platform() !== "win32") {
    return { ok: false, error: "WSL is only available on Windows.", code: "unsupported" };
  }
  const name = typeof distro === "string" ? normalizeDistroName(distro) : "";
  if (!name) return { ok: false, error: "Distro name is required.", code: "invalid" };

  const result = await runWsl(["-d", name, "--", "hostname", "-I"], { encoding: "utf8" });
  if (!result.ok) {
    const missing = result.code === "ENOENT";
    return {
      ok: false,
      error: result.error,
      code: missing ? "missing" : "failed",
    };
  }
  const ip = String(result.stdout)
    .trim()
    .split(/\s+/u)
    .find((part) => part.length > 0);
  if (!ip) return { ok: false, error: "No IP address reported.", code: "failed" };
  return { ok: true, ip, distro: name };
}

export function registerWslHandlers(): void {
  ipcMain.handle("wsl-list-distros", async () => listDistros());
  ipcMain.handle("wsl-distro-ip", async (_event, distro: unknown) => distroIp(distro));
}
