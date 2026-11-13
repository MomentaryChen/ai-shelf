// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod args;
mod engine;
mod paths;
mod system;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

use args::InstallMode;
use paths::{normalize_install_dir, validate_install_dir, DirError};
use system::ExistingInstall;

#[derive(Default)]
struct AppState {
    installing: Arc<AtomicBool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Context {
    locale: String,
    payload_version: String,
    existing: Option<ExistingInstall>,
    default_dir_current_user: String,
    default_dir_all_users: String,
    app_running: bool,
}

#[tauri::command]
fn get_context() -> Context {
    Context {
        // AISHELF_SETUP_LOCALE lets QA check the other language on any Windows.
        locale: std::env::var("AISHELF_SETUP_LOCALE")
            .ok()
            .or_else(sys_locale::get_locale)
            .unwrap_or_else(|| "en".into()),
        payload_version: engine::PAYLOAD_VERSION.into(),
        existing: system::find_existing_install(),
        default_dir_current_user: system::default_dir(InstallMode::CurrentUser)
            .display()
            .to_string(),
        default_dir_all_users: system::default_dir(InstallMode::AllUsers)
            .display()
            .to_string(),
        app_running: system::is_app_running(),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedDir {
    path: String,
    error: Option<DirError>,
}

/// Normalize a user-chosen folder (append "AI Shelf") and say whether it is safe.
#[tauri::command]
fn resolve_dir(dir: String) -> ResolvedDir {
    let path = normalize_install_dir(&dir);
    let error = validate_install_dir(&path, system::dir_state(&path)).err();
    ResolvedDir {
        path: path.display().to_string(),
        error,
    }
}

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle, start: Option<String>) -> Option<String> {
    let mut dialog = app.dialog().file();
    if let Some(s) = start.filter(|s| !s.trim().is_empty()) {
        dialog = dialog.set_directory(PathBuf::from(s));
    }
    dialog
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.display().to_string())
}

#[tauri::command]
fn check_running() -> bool {
    system::is_app_running()
}

#[tauri::command]
async fn close_app(force: bool) -> bool {
    system::close_app(force);
    // Give the app a moment to exit before re-checking.
    for _ in 0..20 {
        if !system::is_app_running() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    false
}

/// `dir = None` → update in place. Progress arrives as `install-progress`, the result as
/// `install-done`.
#[tauri::command]
fn start_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mode: InstallMode,
    dir: Option<String>,
) -> Result<(), String> {
    let target = match dir {
        Some(d) => {
            let path = normalize_install_dir(&d);
            validate_install_dir(&path, system::dir_state(&path)).map_err(|e| format!("{e:?}"))?;
            // The default location takes NSIS's own path logic; only a custom folder
            // is passed as /D.
            (!paths::same_dir(&path, &system::default_dir(mode))).then_some(path)
        }
        None => None,
    };
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("already installing".into());
    }
    let installing = state.installing.clone();
    std::thread::spawn(move || {
        let outcome = engine::run_install(mode, target, |p| {
            let _ = app.emit("install-progress", p);
        });
        installing.store(false, Ordering::SeqCst);
        let _ = app.emit("install-done", outcome);
    });
    Ok(())
}

#[tauri::command]
fn launch_app(location: String) -> Result<(), String> {
    system::launch_app(&PathBuf::from(location)).map_err(|e| e.to_string())
}

/// Fallback: hand over to the standard NSIS wizard and close this window.
#[tauri::command]
fn use_standard_installer(app: tauri::AppHandle) -> Result<(), String> {
    engine::run_standard_installer("").map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn exit_setup(app: tauri::AppHandle) {
    app.exit(0);
}

/// `Setup.exe /S ...` (scripted installs) and machines without WebView2 skip our UI and
/// run the NSIS payload directly with the same arguments.
fn passthrough_if_needed() {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let silent = raw.iter().any(|a| a.eq_ignore_ascii_case("/S"));
    let no_webview = tauri::webview_version().is_err();
    if !silent && !no_webview {
        return;
    }
    let code = match engine::run_standard_installer(&raw.join(" ")).and_then(|mut c| c.wait()) {
        Ok(status) => status.code().unwrap_or(1),
        Err(_) => 1,
    };
    // The payload has exited, so its copy can go.
    engine::cleanup();
    std::process::exit(code);
}

fn webview_data_dir() -> PathBuf {
    engine::work_dir().join("webview")
}

fn main() {
    engine::sweep_stale_work_dirs();
    passthrough_if_needed();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_context,
            resolve_dir,
            pick_folder,
            check_running,
            close_app,
            start_install,
            launch_app,
            use_standard_installer,
            exit_setup,
        ])
        .setup(|app| {
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("AI Shelf Setup")
                    .inner_size(720.0, 460.0)
                    .resizable(false)
                    .maximizable(false)
                    .decorations(false)
                    .center()
                    .visible(false)
                    // Keep WebView2 profile data out of %LOCALAPPDATA%; removed on exit.
                    .data_directory(webview_data_dir())
                    .build()?;
            let _ = window.set_icon(app.default_window_icon().cloned().ok_or("no icon")?);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let installing = window.state::<AppState>().installing.load(Ordering::SeqCst);
                if installing {
                    // Let the UI ask; it calls `exit_setup` if the user insists.
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to start AI Shelf Setup");

    app.run(|_, event| {
        if let RunEvent::Exit = event {
            engine::cleanup();
        }
    });
}
