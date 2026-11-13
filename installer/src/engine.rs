//! Runs the embedded NSIS payload silently and reports staged, monotonic progress.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use crate::args::{nsis_command_line, InstallMode};
use crate::system::{find_existing_install, ExistingInstall};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

static PAYLOAD: &[u8] = include_bytes!(env!("AISHELF_PAYLOAD_PATH"));
pub const PAYLOAD_VERSION: &str = env!("AISHELF_PAYLOAD_VERSION");

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage {
    Prepare,
    Install,
    Finalize,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub stage: Stage,
    pub percent: u8,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Outcome {
    Installed {
        location: String,
        version: String,
    },
    Failed {
        reason: FailReason,
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
        detail: String,
    },
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FailReason {
    /// Could not write or start the payload.
    Launch,
    /// The payload exited non-zero.
    ExitCode,
    /// Exit 0 but the expected version is not installed (e.g. UAC declined, app in use).
    NotInstalled,
}

/// Progress while the payload runs: starts at 12 %, eases toward 92 %, never reaches it.
/// Time-based on purpose — a file-count estimate runs backwards on upgrades, because
/// NSIS removes the old version before extracting the new one.
pub fn install_percent(elapsed: Duration) -> u8 {
    let t = elapsed.as_secs_f64();
    let p = 12.0 + 80.0 * (1.0 - (-t / 9.0).exp());
    p.floor().clamp(12.0, 91.0) as u8
}

/// Temp folder for the extracted payload; removed by [`cleanup`].
pub fn work_dir() -> PathBuf {
    std::env::temp_dir().join(format!("ai-shelf-setup-{}", std::process::id()))
}

pub fn cleanup() {
    let _ = std::fs::remove_dir_all(work_dir());
}

/// Remove work folders left by earlier runs that were killed before they could clean
/// up. A folder whose owning setup process is still alive is left alone.
pub fn sweep_stale_work_dirs() {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(pid) = path
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_prefix("ai-shelf-setup-"))
            .and_then(|p| p.parse::<u32>().ok())
        else {
            continue;
        };
        if pid != std::process::id() && path.is_dir() && !crate::system::is_pid_running(pid) {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

fn write_payload() -> std::io::Result<PathBuf> {
    let dir = work_dir();
    std::fs::create_dir_all(&dir)?;
    let exe = dir.join("AI-Shelf-Setup.exe");
    std::fs::write(&exe, PAYLOAD)?;
    Ok(exe)
}

fn payload_command(exe: &Path, raw_args: &str) -> Command {
    let mut cmd = Command::new(exe);
    #[cfg(windows)]
    cmd.raw_arg(raw_args);
    #[cfg(not(windows))]
    cmd.args(raw_args.split(' '));
    cmd
}

/// Silent install. `dir = None` for updates (keep the registered location).
pub fn run_install(
    mode: InstallMode,
    dir: Option<PathBuf>,
    mut on_progress: impl FnMut(Progress),
) -> Outcome {
    on_progress(Progress {
        stage: Stage::Prepare,
        percent: 3,
    });
    let exe = match write_payload() {
        Ok(p) => p,
        Err(e) => return failed(FailReason::Launch, None, e.to_string()),
    };
    on_progress(Progress {
        stage: Stage::Prepare,
        percent: 10,
    });

    let line = nsis_command_line(mode, dir.as_deref());
    let mut cmd = payload_command(&exe, &line);
    // Never flash a console for the silent payload (no effect on GUI-subsystem NSIS,
    // and the UAC prompt it may raise is unaffected).
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return failed(FailReason::Launch, None, e.to_string()),
    };

    let started = Instant::now();
    let mut last = 0u8;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                let p = install_percent(started.elapsed()).max(last);
                if p != last {
                    last = p;
                    on_progress(Progress {
                        stage: Stage::Install,
                        percent: p,
                    });
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return failed(FailReason::ExitCode, None, e.to_string()),
        }
    };

    on_progress(Progress {
        stage: Stage::Finalize,
        percent: last.max(94),
    });
    let code = status.code();
    if code != Some(0) {
        return failed(
            FailReason::ExitCode,
            code,
            format!("Setup exited with code {code:?}"),
        );
    }

    // Exit 0 is not proof: a declined UAC prompt or a locked file can still quit cleanly.
    verify(code)
}

fn verify(code: Option<i32>) -> Outcome {
    match find_existing_install() {
        Some(ExistingInstall {
            location,
            version: Some(version),
            ..
        }) if version == PAYLOAD_VERSION => Outcome::Installed { location, version },
        Some(found) => failed(
            FailReason::NotInstalled,
            code,
            format!(
                "Expected version {PAYLOAD_VERSION}, found {} at {}",
                found.version.as_deref().unwrap_or("unknown"),
                found.location
            ),
        ),
        None => failed(
            FailReason::NotInstalled,
            code,
            "No AI Shelf install found after setup finished".into(),
        ),
    }
}

fn failed(reason: FailReason, exit_code: Option<i32>, detail: String) -> Outcome {
    Outcome::Failed {
        reason,
        exit_code,
        detail,
    }
}

/// Hand over to the standard NSIS wizard (fallback path). Returns once it has started.
pub fn run_standard_installer(extra_args: &str) -> std::io::Result<std::process::Child> {
    let exe = write_payload()?;
    payload_command(&exe, extra_args).spawn()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_starts_low_and_is_monotonic() {
        let mut prev = 0;
        for ms in (0..120_000).step_by(250) {
            let p = install_percent(Duration::from_millis(ms));
            assert!(p >= prev, "progress went backwards at {ms} ms");
            prev = p;
        }
        assert_eq!(install_percent(Duration::ZERO), 12);
    }

    /// ui/app.js reads these exact keys.
    #[test]
    fn outcome_json_matches_the_ui_contract() {
        let failed = failed(FailReason::NotInstalled, Some(0), "x".into());
        assert_eq!(
            serde_json::to_value(failed).unwrap(),
            serde_json::json!({ "kind": "failed", "reason": "notInstalled", "exitCode": 0, "detail": "x" })
        );
        let ok = Outcome::Installed {
            location: r"C:\A".into(),
            version: "1.0.0".into(),
        };
        assert_eq!(
            serde_json::to_value(ok).unwrap(),
            serde_json::json!({ "kind": "installed", "location": r"C:\A", "version": "1.0.0" })
        );
        let p = Progress {
            stage: Stage::Finalize,
            percent: 94,
        };
        assert_eq!(
            serde_json::to_value(p).unwrap(),
            serde_json::json!({ "stage": "finalize", "percent": 94 })
        );
    }

    #[test]
    fn progress_never_claims_done_while_the_payload_runs() {
        assert!(install_percent(Duration::from_secs(3600)) <= 91);
    }
}
