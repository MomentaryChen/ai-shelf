# Windows code signing

Release CI signs Windows installers with **repository certificate secrets first** and falls back to a **self-signed** Authenticode certificate when secrets are missing.

---

## What you get

| | Self-signed fallback | Trusted certificate (recommended) |
|--|----------------------|-------------------------|
| **CI setup** | Automatic on every tag | Requires `CSC_LINK` + `CSC_KEY_PASSWORD` GitHub secrets |
| **File has signature** | Yes | Yes |
| **SmartScreen / updater trust** | Still warns; updater trust can fail | Verified publisher; updater trust works as expected |
| **User action** | **More info** → **Run anyway** | Usually smoother after reputation |

Self-signed signing is only a **fallback**: it proves the signing pipeline works, but does **not** provide public trust for SmartScreen or in-app update signature validation.

---

## CI behavior

On tag push, [`.github/workflows/release.yml`](../.github/workflows/release.yml):

1. Uses `CSC_LINK` + `CSC_KEY_PASSWORD` GitHub secrets if present (recommended path)
2. Decodes base64 `CSC_LINK` to a temp `.pfx` on the runner (`scripts/prepare-csc-link.ps1`)
3. Otherwise generates a fallback self-signed `.pfx` on the runner (`scripts/new-selfsigned-codesign.ps1`)
4. Signs the NSIS installer via electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`)
5. Verifies the file is signed (`scripts/verify-windows-signature.ps1 -RequireSigned`)

Fallback publisher name in file properties: **AI Shelf (Self-Signed)** (`package.json` → `build.win.signtoolOptions.publisherName` must match the certificate CN).

> For in-app auto-update reliability, use a trusted certificate via repository secrets. Fresh self-signed certs are not trusted on user machines by default.

---

## Local signed build (optional)

```powershell
pnpm dist:win:signed
./scripts/verify-windows-signature.ps1 -Path "release/AI-Shelf-Setup-<version>.exe" -RequireSigned
```

Or step by step:

```powershell
./scripts/new-selfsigned-codesign.ps1
$env:CSC_LINK = ".codesign/ai-shelf-selfsign.pfx"
$env:CSC_KEY_PASSWORD = "ai-shelf-selfsign"
pnpm dist:win
```

The `.codesign/` folder is gitignored. Do not commit `.pfx` files.

### GitHub Actions secrets

Add repository secrets (Settings → Secrets and variables → Actions):

| Name | Value |
|---|---|
| `CSC_LINK` | Base64 of your `.pfx` (single line, no line breaks) |
| `CSC_KEY_PASSWORD` | PFX export password |

Generate both secrets in one step (recommended):

```powershell
./scripts/setup-github-signing-secrets.ps1 -Password "your-strong-password"
```

Or validate an existing PFX and print the `CSC_LINK` line:

```powershell
./scripts/encode-csc-link-secret.ps1 -PfxPath ".codesign/ai-shelf-selfsign.pfx" -Password "your-export-password"
```

Copy the **entire one-line base64 output** into `CSC_LINK`. Set `CSC_KEY_PASSWORD` to the **same export password** (not a hash, not the file path).

```powershell
./scripts/new-selfsigned-codesign.ps1 -Password "your-strong-password"
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".codesign/ai-shelf-selfsign.pfx"))
```

### CI troubleshooting

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| `SignTool Error: ... load the signing certificate from: ...\repo-codesign.pfx` | Wrong `CSC_KEY_PASSWORD`, corrupt `CSC_LINK` base64, or CN mismatch with `publisherName` | Re-run `encode-csc-link-secret.ps1`; update both secrets; ensure CN matches `package.json` → `build.win.signtoolOptions.publisherName` |
| Preflight: `not a valid PFX` / `expected DER header 30 82, got 4D 49...` | **Double base64** (encoding the base64 *text* again) or wrong file type | Run `encode-csc-link-secret.ps1` on the `.pfx` binary; paste that one line into `CSC_LINK` (CI auto-fixes double encoding when detected) |
| Preflight: `Failed to open PFX` | Password does not match the exported PFX | Re-export with a known password; update `CSC_KEY_PASSWORD` (trim accidental newlines in the secret) |
| Preflight: `Decoded CSC_LINK is too small` | Secret is a file path or truncated base64, not raw PFX bytes | Store base64 of the `.pfx` file, not a path string |

Release CI decodes secrets in `prepare-csc-link.ps1`, validates the PFX with `assert-signing-pfx.ps1` **before** electron-builder runs, and writes `GITHUB_ENV` via `write-github-env.ps1` (heredoc; avoids special-character / BOM issues in `CSC_KEY_PASSWORD`).

---

## Upgrade path (when you want real SmartScreen trust)

Use a CA certificate or [SignPath Foundation](https://signpath.org/) (free for qualifying OSS), then store the signing material in:

- `CSC_LINK` (base64 PFX or secure URL — same env var electron-builder expects)
- `CSC_KEY_PASSWORD`

---

## Related docs

- [RELEASE.md](RELEASE.md) — tagging and release checklist
- [README.md](../README.md) — user install / SmartScreen steps
