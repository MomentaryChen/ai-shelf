//! Install-directory rules.
//!
//! The NSIS uninstaller removes `$INSTDIR` recursively. The wizard guards against a bare
//! parent folder (`instFilesPre` appends the app folder), but that page callback never
//! runs in silent mode — so the bootstrapper must enforce the same rules itself, or a
//! later uninstall of `/D=D:\Tools` would wipe `D:\Tools`.

use std::path::{Component, Path, PathBuf};

/// `APP_FILENAME` electron-builder derives from productName "AI Shelf"
/// ("AI Shelf Stub" in stub builds — see build.rs).
pub const APP_DIR_NAME: &str = env!("AISHELF_APP_DIR_NAME");
/// Main executable inside the install directory.
pub const APP_EXE_NAME: &str = concat!(env!("AISHELF_APP_DIR_NAME"), ".exe");

/// What is currently at a candidate install path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DirState {
    Missing,
    Empty,
    /// Non-empty; `has_app_exe` = an AI Shelf install already lives there.
    NonEmpty {
        has_app_exe: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DirError {
    Empty,
    NotAbsolute,
    DriveRoot,
    InvalidChars,
    NotEmpty,
}

/// Trim, drop trailing separators and make sure the path ends in the app folder.
pub fn normalize_install_dir(chosen: &str) -> PathBuf {
    let trimmed = chosen.trim().trim_end_matches(['\\', '/']);
    let path = PathBuf::from(trimmed);
    let ends_with_app = path
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.eq_ignore_ascii_case(APP_DIR_NAME));
    if ends_with_app {
        path
    } else {
        path.join(APP_DIR_NAME)
    }
}

/// Validate a normalized install path. `dir_state` is what exists there now.
pub fn validate_install_dir(path: &Path, dir_state: DirState) -> Result<(), DirError> {
    let raw = path.to_string_lossy();
    if raw.trim().is_empty() {
        return Err(DirError::Empty);
    }
    // NSIS `/D=` must be the last, unquoted argument — a quote would break parsing.
    if raw.contains('"') || raw.contains('\n') || raw.contains('\r') {
        return Err(DirError::InvalidChars);
    }
    if !is_absolute_windows(&raw) {
        return Err(DirError::NotAbsolute);
    }
    let normal_parts = path
        .components()
        .filter(|c| matches!(c, Component::Normal(_)))
        .count();
    if normal_parts == 0 {
        return Err(DirError::DriveRoot);
    }
    match dir_state {
        DirState::Missing | DirState::Empty => Ok(()),
        DirState::NonEmpty { has_app_exe: true } => Ok(()),
        DirState::NonEmpty { has_app_exe: false } => Err(DirError::NotEmpty),
    }
}

/// `C:\...` or `\\server\share\...` — checked on the string so tests run on any OS.
fn is_absolute_windows(raw: &str) -> bool {
    let b = raw.as_bytes();
    let drive = b.len() >= 3
        && b[0].is_ascii_alphabetic()
        && b[1] == b':'
        && (b[2] == b'\\' || b[2] == b'/');
    drive || raw.starts_with("\\\\")
}

#[cfg(test)]
mod tests {
    //! Expectations use the production folder name; run `cargo test` without
    //! `AISHELF_APP_DIR_NAME` set (the stub build sets it to "AI Shelf Stub").
    use super::*;

    #[test]
    fn tests_run_against_the_production_folder_name() {
        assert_eq!(
            APP_DIR_NAME, "AI Shelf",
            "unset AISHELF_APP_DIR_NAME before cargo test"
        );
    }

    #[test]
    fn appends_app_folder_to_a_bare_parent() {
        assert_eq!(
            normalize_install_dir(r"D:\Tools"),
            PathBuf::from(r"D:\Tools\AI Shelf")
        );
        assert_eq!(
            normalize_install_dir(r"D:\Tools\\ "),
            PathBuf::from(r"D:\Tools\AI Shelf")
        );
    }

    #[test]
    fn keeps_a_path_that_already_ends_in_the_app_folder() {
        assert_eq!(
            normalize_install_dir(r"D:\Apps\AI Shelf"),
            PathBuf::from(r"D:\Apps\AI Shelf")
        );
        assert_eq!(
            normalize_install_dir(r"D:\Apps\ai shelf\"),
            PathBuf::from(r"D:\Apps\ai shelf")
        );
    }

    #[test]
    fn does_not_trust_the_app_name_in_a_parent_segment() {
        // electron-builder's StrContains would accept this; a later uninstall would wipe "Stuff".
        assert_eq!(
            normalize_install_dir(r"D:\AI Shelf\Stuff"),
            PathBuf::from(r"D:\AI Shelf\Stuff\AI Shelf")
        );
    }

    #[test]
    fn accepts_missing_empty_or_existing_install() {
        let p = normalize_install_dir(r"C:\Users\me\AppData\Local\Programs");
        assert_eq!(validate_install_dir(&p, DirState::Missing), Ok(()));
        assert_eq!(validate_install_dir(&p, DirState::Empty), Ok(()));
        assert_eq!(
            validate_install_dir(&p, DirState::NonEmpty { has_app_exe: true }),
            Ok(())
        );
    }

    #[test]
    fn refuses_a_foreign_non_empty_folder() {
        let p = normalize_install_dir(r"D:\Tools");
        assert_eq!(
            validate_install_dir(&p, DirState::NonEmpty { has_app_exe: false }),
            Err(DirError::NotEmpty)
        );
    }

    #[test]
    fn refuses_relative_quoted_and_empty_paths() {
        assert_eq!(
            validate_install_dir(Path::new(r"Tools\AI Shelf"), DirState::Missing),
            Err(DirError::NotAbsolute)
        );
        assert_eq!(
            validate_install_dir(Path::new(r#"C:\a"b\AI Shelf"#), DirState::Missing),
            Err(DirError::InvalidChars)
        );
        assert_eq!(
            validate_install_dir(Path::new("  "), DirState::Missing),
            Err(DirError::Empty)
        );
    }

    #[test]
    fn accepts_unc_paths() {
        let p = normalize_install_dir(r"\\nas\apps");
        assert_eq!(validate_install_dir(&p, DirState::Missing), Ok(()));
    }
}
