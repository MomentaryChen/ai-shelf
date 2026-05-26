# Windows code signing (self-signed)

Release CI **automatically signs** Windows installers with a **self-signed** Authenticode certificate. No GitHub secrets, no CA purchase, no manual setup.

---

## What you get

| | Self-signed (current) | CA certificate (future) |
|--|----------------------|-------------------------|
| **CI setup** | Automatic on every tag | Requires secrets + purchase / SignPath |
| **File has signature** | Yes | Yes |
| **SmartScreen** | Still warns (unknown publisher) | Shows verified publisher; reputation builds over time |
| **User action** | **More info** → **Run anyway** | Usually smoother after reputation |

Self-signed signing is a **low-friction placeholder**: the pipeline exercises Authenticode signing end-to-end, but **does not remove SmartScreen friction** for end users.

---

## CI behavior

On tag push, [`.github/workflows/release.yml`](../.github/workflows/release.yml):

1. Generates a fresh self-signed `.pfx` on the runner (`scripts/new-selfsigned-codesign.ps1`)
2. Signs the NSIS installer via electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`)
3. Verifies the file is signed (`scripts/verify-windows-signature.ps1 -RequireSigned`)

Publisher name in file properties: **AI Shelf (Self-Signed)**.

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

When ready for trusted signing, replace the self-signed step with a CA or [SignPath Foundation](https://signpath.org/) (free for qualifying OSS). That requires workflow changes and secrets — not needed for the current self-signed setup.

---

## Related docs

- [RELEASE.md](RELEASE.md) — tagging and release checklist
- [README.md](../README.md) — user install / SmartScreen steps
