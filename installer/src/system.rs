//! Windows-specific lookups: existing install, default folders, running app, folder state.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::args::InstallMode;
use crate::paths::{DirState, APP_DIR_NAME, APP_EXE_NAME};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// `CREATE_NO_WINDOW` — keep helper consoles (tasklist / taskkill) invisible.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn registry_key() -> &'static str {
    env!("AISHELF_REGISTRY_KEY")
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingInstall {
    pub location: String,
    pub version: Option<String>,
    pub mode: InstallMode,
}

/// `Software\<key>\InstallLocation` (HKCU = per-user, HKLM = per-machine), plus
/// `...\Uninstall\<key>\DisplayVersion`. Only counts when the exe is really there.
#[cfg(windows)]
pub fn find_existing_install() -> Option<ExistingInstall> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let key = registry_key();
    for (hive, mode) in [
        (HKEY_CURRENT_USER, InstallMode::CurrentUser),
        (HKEY_LOCAL_MACHINE, InstallMode::AllUsers),
    ] {
        let root = RegKey::predef(hive);
        let Ok(app) = root.open_subkey(format!(r"Software\{key}")) else {
            continue;
        };
        let Ok(location) = app.get_value::<String, _>("InstallLocation") else {
            continue;
        };
        if location.trim().is_empty() || !Path::new(&location).join(APP_EXE_NAME).is_file() {
            continue;
        }
        let version = root
            .open_subkey(format!(
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{key}"
            ))
            .and_then(|u| u.get_value::<String, _>("DisplayVersion"))
            .ok();
        return Some(ExistingInstall {
            location,
            version,
            mode,
        });
    }
    None
}

#[cfg(not(windows))]
pub fn find_existing_install() -> Option<ExistingInstall> {
    None
}

/// Same defaults as electron-builder's multiUser.nsh.
pub fn default_dir(mode: InstallMode) -> PathBuf {
    match mode {
        InstallMode::CurrentUser => user_program_files().join(APP_DIR_NAME),
        InstallMode::AllUsers => std::env::var_os("ProgramW6432")
            .or_else(|| std::env::var_os("ProgramFiles"))
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"))
            .join(APP_DIR_NAME),
    }
}

#[cfg(windows)]
fn user_program_files() -> PathBuf {
    known_folders::get_known_folder_path(known_folders::KnownFolder::UserProgramFiles)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("Programs")
        })
}

#[cfg(not(windows))]
fn user_program_files() -> PathBuf {
    PathBuf::from("/tmp/Programs")
}

pub fn dir_state(path: &Path) -> DirState {
    match std::fs::read_dir(path) {
        Err(_) => DirState::Missing,
        Ok(mut entries) => {
            if entries.next().is_none() {
                DirState::Empty
            } else {
                DirState::NonEmpty {
                    has_app_exe: path.join(APP_EXE_NAME).is_file(),
                }
            }
        }
    }
}

fn hidden_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Is any `AI Shelf.exe` running for this user?
pub fn is_app_running() -> bool {
    let out = hidden_command("tasklist")
        .args([
            "/FI",
            &format!("IMAGENAME eq {APP_EXE_NAME}"),
            "/NH",
            "/FO",
            "CSV",
        ])
        .output();
    match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .to_ascii_lowercase()
            .contains(&format!("\"{}\"", APP_EXE_NAME.to_ascii_lowercase())),
        Err(_) => false,
    }
}

/// Is a process with this PID alive? (Unknown → assume yes, so nothing gets deleted.)
pub fn is_pid_running(pid: u32) -> bool {
    match hidden_command("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout).contains(&format!("\"{pid}\"")),
        Err(_) => true,
    }
}

/// Ask AI Shelf to exit; `force` ends it immediately (open terminals are lost).
pub fn close_app(force: bool) {
    let mut cmd = hidden_command("taskkill");
    if force {
        cmd.arg("/F");
    }
    let _ = cmd.args(["/T", "/IM", APP_EXE_NAME]).status();
}

/// Start the installed app as the current (non-elevated) user.
pub fn launch_app(location: &Path) -> std::io::Result<()> {
    Command::new(location.join(APP_EXE_NAME))
        .current_dir(location)
        .spawn()
        .map(|_| ())
}
