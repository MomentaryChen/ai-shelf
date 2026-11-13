use std::path::PathBuf;

/// Build-time inputs (only the payload is required):
///
/// - `AISHELF_PAYLOAD`: path to the NSIS `AI-Shelf-Setup-<ver>.exe` to embed.
/// - `AISHELF_PAYLOAD_VERSION`: version of that payload (e.g. `4.4.0`).
/// - `AISHELF_REGISTRY_KEY`: app key under `Software\` (default `com.ai-shelf`).
///   The stub payload uses `com.ai-shelf.stub` so dev runs never touch a real install.
/// - `AISHELF_APP_DIR_NAME`: install folder + exe base name (default `AI Shelf`).
fn main() {
    println!("cargo:rerun-if-env-changed=AISHELF_PAYLOAD");
    println!("cargo:rerun-if-env-changed=AISHELF_PAYLOAD_VERSION");
    println!("cargo:rerun-if-env-changed=AISHELF_REGISTRY_KEY");
    println!("cargo:rerun-if-env-changed=AISHELF_APP_DIR_NAME");

    let payload = std::env::var("AISHELF_PAYLOAD")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            panic!(
                "AISHELF_PAYLOAD is not set. Point it at the NSIS setup exe to embed \
                 (or run installer/scripts/build-dev.ps1 to build against the stub payload)."
            )
        });
    let payload = payload
        .canonicalize()
        .unwrap_or_else(|e| panic!("AISHELF_PAYLOAD {} is not readable: {e}", payload.display()));
    println!("cargo:rerun-if-changed={}", payload.display());
    println!("cargo:rustc-env=AISHELF_PAYLOAD_PATH={}", payload.display());

    let key = std::env::var("AISHELF_REGISTRY_KEY").unwrap_or_else(|_| "com.ai-shelf".into());
    let version = match std::env::var("AISHELF_PAYLOAD_VERSION") {
        Ok(v) if !v.trim().is_empty() => v,
        // Setup verifies the installed version against this; a placeholder would turn
        // every successful real install into an error screen.
        _ if key == "com.ai-shelf" && std::env::var("PROFILE").as_deref() == Ok("release") => {
            panic!(
                "AISHELF_PAYLOAD_VERSION must be set for a release build with a real payload \
             (the version of the embedded AI-Shelf-Setup exe)."
            )
        }
        _ => "0.0.0-dev".into(),
    };
    println!("cargo:rustc-env=AISHELF_PAYLOAD_VERSION={version}");

    println!("cargo:rustc-env=AISHELF_REGISTRY_KEY={key}");

    // Install folder and exe name. Stub builds use "AI Shelf Stub" so a dev run can
    // never overwrite — or taskkill — the real AI Shelf on the same machine.
    let dir_name = std::env::var("AISHELF_APP_DIR_NAME").unwrap_or_else(|_| "AI Shelf".into());
    println!("cargo:rustc-env=AISHELF_APP_DIR_NAME={dir_name}");

    tauri_build::build();
}
