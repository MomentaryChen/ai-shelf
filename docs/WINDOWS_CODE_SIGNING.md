# Windows code signing

Release CI signs Windows installers with **repository certificate secrets first** and falls back to a **self-signed** Authenticode certificate when secrets are missing.

---

## What you get

| | Self-signed fallback | Trusted certificate (recommended) |
|--|----------------------|-------------------------|
| **CI setup** | Automatic on every tag | Requires `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` secrets |
| **File has signature** | Yes | Yes |
| **SmartScreen / updater trust** | Still warns; updater trust can fail | Verified publisher; updater trust works as expected |
| **User action** | **More info** → **Run anyway** | Usually smoother after reputation |

Self-signed signing is only a **fallback**: it proves the signing pipeline works, but does **not** provide public trust for SmartScreen or in-app update signature validation.

---

## CI behavior

On tag push, [`.github/workflows/release.yml`](../.github/workflows/release.yml):

1. Uses `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` if present (recommended path)
2. Otherwise generates a fallback self-signed `.pfx` on the runner (`scripts/new-selfsigned-codesign.ps1`)
3. Signs the NSIS installer via electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`)
4. Verifies the file is signed (`scripts/verify-windows-signature.ps1 -RequireSigned`)

Fallback publisher name in file properties: **AI Shelf (Self-Signed)**.

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

---

## Upgrade path (when you want real SmartScreen trust)

Use a CA certificate or [SignPath Foundation](https://signpath.org/) (free for qualifying OSS), then store the signing material in:

- `WIN_CSC_LINK` (base64 PFX or secure URL)
- `WIN_CSC_KEY_PASSWORD`

---

## Related docs

- [RELEASE.md](RELEASE.md) — tagging and release checklist
- [README.md](../README.md) — user install / SmartScreen steps
