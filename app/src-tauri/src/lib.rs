//! The desktop shell (W5.1): the plan's §4 shell - Tauri + React.
//!
//! The shell is a **shell**: it draws the app and it carries the IPC to the core ✓, and
//! the core is the brain ✓. The channel is the bridge crate's ✓ (one JSON object per line
//! over stdio ✓), and the core runs as a sidecar ✓ - the shell starts it, keeps it, and
//! stops it with the window ✓.
//!
//! The engine's name belongs in the licence notice, never in the branding ✓ (ADR-0004 ✓):
//! nothing in this crate names a bundled component ✓ — the notices live in the app's legal
//! module ✓.

use std::sync::Mutex;

use archres_bridge::Bridge;
use serde_json::Value;
use tauri::{Manager, State};

/// The core, held for the life of the window.
pub struct CoreSidecar(Mutex<Option<Bridge>>);

/// Ask the core a question, over the bridge.
#[tauri::command]
fn ask(state: State<'_, CoreSidecar>, id: String, method: String, params: Value) -> Value {
    let mut guard = state.0.lock().expect("the sidecar lock is not poisoned");
    let bridge = match guard.as_mut() {
        Some(bridge) => bridge,
        None => {
            return serde_json::json!({
                "id": id,
                "error": { "code": "worker_down", "message": "the core is not running" }
            })
        }
    };
    let request = archres_bridge::Request::with_params(id, method, params);
    match bridge.call(&request) {
        Ok(response) => serde_json::to_value(response).unwrap_or_else(|error| {
            serde_json::json!({
                "id": id,
                "error": { "code": "internal", "message": error.to_string() }
            })
        }),
        Err(error) => serde_json::json!({
            "id": id,
            "error": { "code": "worker_down", "message": error.to_string() }
        }),
    }
}

/// The core's health, for the About screen.
#[tauri::command]
fn core_health(state: State<'_, CoreSidecar>) -> Value {
    let mut guard = state.0.lock().expect("the sidecar lock is not poisoned");
    match guard.as_mut() {
        Some(bridge) => match bridge.ping() {
            Ok(response) => serde_json::to_value(response).unwrap_or(Value::Null),
            Err(error) => serde_json::json!({ "error": error.to_string() }),
        },
        None => serde_json::json!({ "error": "the core is not running" }),
    }
}

/// Start the core as a sidecar and hand the window its commands.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CoreSidecar(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            // The core is started after the window exists, so its stdio is the shell's.
            let root = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let python = std::env::var("ARCHRES_PYTHON").unwrap_or_else(|_| "python".to_string());
            match Bridge::start(&python, &root) {
                Ok(bridge) => {
                    let state = handle.state::<CoreSidecar>();
                    let mut guard = state.0.lock().expect("the sidecar lock is not poisoned");
                    *guard = Some(bridge);
                }
                Err(error) => {
                    // A core that will not start is reported, not hidden: the window shows
                    // it, and the app's flows that need the core say why they cannot run.
                    eprintln!("the core did not start: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ask, core_health])
        .run(tauri::generate_context!())
        .expect("the shell could not start");
}
