#[tauri::command]
fn get_app_info() -> serde_json::Value {
  serde_json::json!({
    "name": "ArchResidenceBD",
    "version": "1.0.0",
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
