use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    mode: &'static str,
    name: &'static str,
    version: &'static str,
    platform: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        mode: "desktop",
        name: "Pathloom Desktop",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_info])
        .run(tauri::generate_context!())
        .expect("error while running Pathloom");
}
