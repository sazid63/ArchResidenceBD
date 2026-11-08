#[tauri::command]
fn get_app_info(app: tauri::AppHandle) -> serde_json::Value {
  // The version comes from tauri.conf.json, which points at package.json (the single source).
  let info = app.package_info();
  serde_json::json!({
    "name": info.name,
    "version": info.version.to_string(),
    "engine": "tauri",
    "platform": std::env::consts::OS,
  })
}

pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_app_info])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
