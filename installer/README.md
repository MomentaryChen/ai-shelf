# AI Shelf Setup (custom installer)

A small Tauri (Rust + WebView2) bootstrapper that replaces the stock NSIS wizard for
**first installs** with AI Shelf's own UI. It embeds the regular electron-builder NSIS
setup (`AI-Shelf-Setup-<ver>.exe`) and runs it silently, so install location, registry
entries, uninstaller, `latest.yml` and in-app updates (`electron-updater`) all stay
exactly as they are.

```
ai-shelf-setup.exe  (Tauri window: Start → Installing → Done / Error)
  └─ embedded NSIS payload  /S /currentuser|/allusers [/D=<dir>]
```

## Behaviour

- **Fresh install:** the default location matches NSIS (`%LocalAppData%\Programs\AI Shelf`,
  or `Program Files\AI Shelf` for all users). Under **Customize** you can pick per-user or
  all users, and choose a folder.
  - The folder always ends in `AI Shelf`. If it doesn't, setup appends `AI Shelf`.
  - A folder that already holds other files is refused. The NSIS uninstaller deletes
    `$INSTDIR` recursively, and in silent mode the wizard's own guard never runs.
  - Only a custom folder is passed as `/D=` (last and unquoted, which NSIS's
    `GetDParameter` reads to the end of the line). The default location lets NSIS pick
    the path itself.
- **Update / reinstall:** if `Software\com.ai-shelf\InstallLocation` exists (HKCU or HKLM)
  and the exe is there, setup shows `vOld → vNew`. It keeps the registered location, so
  `/D` is not passed: `/D` would override the existing install path.
- **AI Shelf running:** setup asks you to close it, with a force-close fallback, before it
  starts.
- **Progress:** three named stages. The bar only moves forward and never reaches 100% while
  NSIS is still running.
- **Success check:** exit code 0 alone is not enough. Setup re-reads the registry and
  requires the payload version and the exe to be present. A declined UAC prompt can still
  exit 0.
- **Launch:** setup starts the app itself from the Done screen, as the current user, and
  never with NSIS `--force-run`. This keeps the app from inheriting elevation.
- **Fallbacks:**
  - `ai-shelf-setup.exe /S ...` (scripted installs) and machines without WebView2 run the
    NSIS payload directly with the same arguments.
  - The Error screen offers **Use standard installer**, which runs the regular wizard.
- **Housekeeping:** the payload and the WebView2 profile live in
  `%TEMP%\ai-shelf-setup-<pid>`. That folder is removed on exit. Folders left behind by
  killed runs are swept on the next start.

## Develop

Requires Rust (stable, MSVC) and WebView2 (built into Windows 11).

```powershell
# Safe on a dev machine: embeds the stub payload, which registers under
# HKCU\Software\com.ai-shelf.stub and installs "AI Shelf Stub" — never the real app.
./installer/scripts/build-dev.ps1 -Release -Version 9.9.9
./installer/target/release/ai-shelf-setup.exe
```

Stub knobs (environment variables, inherited by the payload):

| Variable                       | Effect                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `AISHELF_STUB_SECONDS`         | how long the fake install takes (default 6)                    |
| `AISHELF_STUB_EXIT`            | exit code to return, e.g. `2` → Error screen                   |
| `AISHELF_STUB_VERSION`         | version it registers. Must match `-Version` for success        |
| `AISHELF_STUB_SKIP_REGISTRY=1` | exit 0 without installing (simulates a declined UAC)           |
| `AISHELF_STUB_LINGER_SECONDS`  | keep the "installed app" alive, to test the running-app banner |
| `AISHELF_SETUP_LOCALE`         | force the UI language (`zh-TW`, `en`)                          |

Remove a stub install with:

```powershell
Remove-Item HKCU:\Software\com.ai-shelf.stub, "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.ai-shelf.stub" -Recurse
Remove-Item "$env:LOCALAPPDATA\Programs\AI Shelf Stub" -Recurse -Force
```

Unit tests cover the path rules, NSIS arguments, progress curve and the UI JSON contract.
Run them with the default (non-stub) names:

```powershell
$env:AISHELF_PAYLOAD = "installer/target/release/stub-setup.exe"   # any file; it is only embedded
cargo test --manifest-path installer/Cargo.toml -p ai-shelf-setup
```

**Real payload:** embedding a real NSIS setup
(`build-dev.ps1 -Payload release/AI-Shelf-Setup-x.exe -Version x`) replaces the installed
AI Shelf when you click Install. Run that only in a VM or Windows Sandbox.

## Not yet done

- CI build and code signing for `ai-shelf-setup.exe`.
- Release asset naming. It must **not** reuse `AI-Shelf-Setup-<ver>.exe`, which
  `latest.yml` and `electron-updater` point at.
- Uninstall still uses the standard NSIS uninstaller UI.
