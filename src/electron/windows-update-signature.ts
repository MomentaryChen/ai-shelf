import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** PowerShell SignatureStatus: Valid = 0, HashValid = 1 (signed, untrusted root). */
const AUTHENTICODE_VALID = 0;
const AUTHENTICODE_HASH_VALID = 1;

type AuthenticodeJson = {
  Status: number;
  StatusMessage?: string;
  Path?: string;
  SignerCertificate?: { Subject?: string };
};

function extractCommonName(subject: string): string | null {
  const match = subject.match(/(?:^|,)\s*CN=([^,]+)/i);
  return match?.[1]?.trim() ?? null;
}

function publisherMatches(signerSubject: string, publisherNames: string[]): boolean {
  const signerCn = extractCommonName(signerSubject);
  for (const expected of publisherNames) {
    if (!expected) continue;
    if (expected.includes("=")) {
      if (signerSubject.includes(expected)) return true;
    } else if (signerCn === expected || signerSubject.includes(`CN=${expected}`)) {
      return true;
    }
  }
  return false;
}

/**
 * electron-updater only accepts SignatureStatus.Valid (0). Self-signed release builds
 * return HashValid (1) with a matching publisher CN — allow that for in-app updates.
 */
export async function verifyWindowsUpdateSignature(
  publisherNames: string[],
  updateFilePath: string
): Promise<string | null> {
  const escapedPath = updateFilePath.replace(/'/g, "''");
  const command = `Get-AuthenticodeSignature -LiteralPath '${escapedPath}' | ConvertTo-Json -Compress`;
  const executable = 'set "PSModulePath=" & chcp 65001 >NUL & powershell.exe';
  const args = ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-Command", command];

  try {
    const { stdout } = await execFileAsync(executable, args, {
      shell: true,
      timeout: 20_000,
    });

    const data = JSON.parse(stdout.trim()) as AuthenticodeJson;
    const signerSubject = data.SignerCertificate?.Subject;
    if (!signerSubject) {
      return "Update installer is not Authenticode-signed.";
    }

    if (data.Path) {
      const normalizedExpected = path.normalize(updateFilePath);
      const normalizedActual = path.normalize(data.Path);
      if (normalizedActual !== normalizedExpected) {
        return `Signature path mismatch: ${normalizedActual} vs ${normalizedExpected}`;
      }
    }

    if (!publisherMatches(signerSubject, publisherNames)) {
      const cn = extractCommonName(signerSubject);
      return `publisherNames: ${publisherNames.join(" | ")}, signer CN: ${cn ?? signerSubject}`;
    }

    if (data.Status === AUTHENTICODE_VALID || data.Status === AUTHENTICODE_HASH_VALID) {
      return null;
    }

    return (
      data.StatusMessage ??
      `Authenticode status ${data.Status} is not Valid or HashValid.`
    );
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
