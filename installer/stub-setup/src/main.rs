//! Stand-in for `AI-Shelf-Setup-<ver>.exe` while developing the custom installer.
//!
//! Understands the same switches the bootstrapper passes (`/S`, `/currentuser`,
//! `/allusers`, `/D=<dir>` last and unquoted) and "installs" by copying itself to
//! `<dir>\AI Shelf Stub.exe` and registering under `HKCU\Software\com.ai-shelf.stub` —
//! never the real `com.ai-shelf` key, folder or exe name.
//!
//! Environment knobs (inherited from the installer process):
//!   AISHELF_STUB_SECONDS          how long to "install" (default 6)
//!   AISHELF_STUB_EXIT             exit code to return (default 0)
//!   AISHELF_STUB_VERSION          version to register (default 0.0.0-dev)
//!   AISHELF_STUB_SKIP_REGISTRY=1  exit 0 without registering (simulates a declined UAC)
//!   AISHELF_STUB_APP_NAME         folder + exe base name (default "AI Shelf Stub")
//!   AISHELF_STUB_LINGER_SECONDS   when run as the installed app, stay alive this long
//!
//! Launched with no arguments (as the "installed app"), it exits immediately.

// GUI subsystem like the real NSIS setup, so no console window appears.
#![windows_subsystem = "windows"]

use std::path::PathBuf;
use std::time::Duration;

const KEY: &str = "com.ai-shelf.stub";

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        // Acting as the installed app: optionally stay alive so setup's
        // "AI Shelf is running" flow can be exercised.
        let linger: u64 = env_or("AISHELF_STUB_LINGER_SECONDS", "0")
            .parse()
            .unwrap_or(0);
        std::thread::sleep(Duration::from_secs(linger));
        return;
    }
    let all_users = args.iter().any(|a| a.eq_ignore_ascii_case("/allusers"));
    // `/D=` is last and unquoted, so a path with spaces arrives split across args.
    let dir = args
        .iter()
        .position(|a| a.to_ascii_uppercase().starts_with("/D="))
        .map(|i| PathBuf::from(args[i..].join(" ")[3..].to_string()));

    eprintln!("stub-setup: all_users={all_users} dir={dir:?} args={args:?}");

    let seconds: u64 = env_or("AISHELF_STUB_SECONDS", "6").parse().unwrap_or(6);
    std::thread::sleep(Duration::from_secs(seconds));

    let code: i32 = env_or("AISHELF_STUB_EXIT", "0").parse().unwrap_or(0);
    if code != 0 {
        std::process::exit(code);
    }
    if env_or("AISHELF_STUB_SKIP_REGISTRY", "") == "1" {
        return;
    }

    // Must match the installer's AISHELF_APP_DIR_NAME (build-dev.ps1 uses "AI Shelf Stub").
    let name = env_or("AISHELF_STUB_APP_NAME", "AI Shelf Stub");
    let target = dir.or_else(registered_location).unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default())
            .join("Programs")
            .join(&name)
    });
    std::fs::create_dir_all(&target).expect("create install dir");
    let me = std::env::current_exe().expect("current exe");
    std::fs::copy(me, target.join(format!("{name}.exe"))).expect("copy app exe");
    register(&target, &env_or("AISHELF_STUB_VERSION", "0.0.0-dev"));
}

#[cfg(windows)]
fn registered_location() -> Option<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(format!(r"Software\{KEY}"))
        .and_then(|k| k.get_value::<String, _>("InstallLocation"))
        .ok()
        .map(PathBuf::from)
}

#[cfg(windows)]
fn register(location: &std::path::Path, version: &str) {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (app, _) = hkcu
        .create_subkey(format!(r"Software\{KEY}"))
        .expect("app key");
    app.set_value("InstallLocation", &location.display().to_string())
        .expect("InstallLocation");
    let (un, _) = hkcu
        .create_subkey(format!(
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{KEY}"
        ))
        .expect("uninstall key");
    un.set_value("DisplayName", &"AI Shelf (stub)")
        .expect("DisplayName");
    un.set_value("DisplayVersion", &version)
        .expect("DisplayVersion");
}

#[cfg(not(windows))]
fn registered_location() -> Option<PathBuf> {
    None
}

#[cfg(not(windows))]
fn register(_: &std::path::Path, _: &str) {}
