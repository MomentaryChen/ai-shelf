//! NSIS command line for the embedded payload.
//!
//! Built as a raw string (passed with `CommandExt::raw_arg`) because NSIS requires
//! `/D=` to be the *last* argument and *unquoted*, even when the path has spaces —
//! `std::process::Command::arg` would wrap it in quotes and NSIS would ignore it.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallMode {
    CurrentUser,
    AllUsers,
}

/// `dir = None` keeps the location NSIS reads from the registry (updates must not pass
/// `/D`: in electron-builder's multiUser.nsh it overrides even an existing install).
/// No `--force-run`: the bootstrapper launches the app itself so it never starts elevated.
pub fn nsis_command_line(mode: InstallMode, dir: Option<&Path>) -> String {
    let mut parts = vec!["/S".to_string()];
    parts.push(
        match mode {
            InstallMode::CurrentUser => "/currentuser",
            InstallMode::AllUsers => "/allusers",
        }
        .to_string(),
    );
    if let Some(d) = dir {
        parts.push(format!("/D={}", d.display()));
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn fresh_per_user_install_puts_unquoted_d_last() {
        let dir = PathBuf::from(r"C:\Users\me\AppData\Local\Programs\AI Shelf");
        assert_eq!(
            nsis_command_line(InstallMode::CurrentUser, Some(&dir)),
            r"/S /currentuser /D=C:\Users\me\AppData\Local\Programs\AI Shelf"
        );
    }

    #[test]
    fn all_users_install() {
        let dir = PathBuf::from(r"C:\Program Files\AI Shelf");
        assert_eq!(
            nsis_command_line(InstallMode::AllUsers, Some(&dir)),
            r"/S /allusers /D=C:\Program Files\AI Shelf"
        );
    }

    #[test]
    fn update_omits_d_and_never_forces_run() {
        let line = nsis_command_line(InstallMode::CurrentUser, None);
        assert_eq!(line, "/S /currentuser");
        assert!(!line.contains("--force-run"));
    }
}
