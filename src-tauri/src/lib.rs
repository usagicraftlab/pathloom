mod codex_bridge;
mod project_files;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder}, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::Message};

const GH_HOST: &str = "127.0.0.1";
const GH_PORT: u16 = 8765;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    mode: &'static str,
    name: &'static str,
    version: &'static str,
    platform: &'static str,
    arch: &'static str,
    grasshopper_endpoint: String,
}

#[derive(Default)]
struct GrasshopperState {
    connected_clients: usize,
    last_source: Option<String>,
    last_update_ms: Option<u128>,
    last_error: Option<String>,
}

type SharedGrasshopperState = Arc<Mutex<GrasshopperState>>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GrasshopperStatus {
    listening: bool,
    endpoint: String,
    connected_clients: usize,
    last_source: Option<String>,
    last_update_ms: Option<u128>,
    last_error: Option<String>,
}

#[derive(Deserialize)]
struct ToolpathEnvelope {
    #[serde(rename = "type")]
    message_type: String,
    source: String,
    #[serde(default)]
    label: Option<String>,
    paths: Vec<Value>,
}

#[tauri::command]
async fn choose_live_toolpath(app: tauri::AppHandle) -> Result<Option<Vec<String>>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file()
        .set_title("Choose a live toolpath file")
        .add_filter("Toolpath", &["toolpath", "json"])
        .pick_files(move |files| {
            let result = files.map(|files| files.into_iter().map(|file| file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| error.to_string())).collect::<Result<Vec<_>, String>>()).transpose();
            let _ = sender.send(result);
        });
    receiver.await.map_err(|error| error.to_string())?
}

// Read the pathname again on every poll, including after atomic file replacement.
#[tauri::command]
async fn read_live_toolpath(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&path);
        if !path.is_absolute() {
            return Err("Enter an absolute file path".into());
        }
        let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("");
        if !extension.eq_ignore_ascii_case("toolpath") && !extension.eq_ignore_ascii_case("json") {
            return Err("Choose a .toolpath or .json file".into());
        }
        std::fs::read_to_string(path).map_err(|error| format!("Unable to read file: {error}"))
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        mode: "desktop",
        name: "Pathloom Desktop",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        grasshopper_endpoint: format!("ws://{}:{}", GH_HOST, GH_PORT),
    }
}

#[tauri::command]
fn grasshopper_bridge_status(state: State<'_, SharedGrasshopperState>) -> GrasshopperStatus {
    let state = state.lock().expect("grasshopper state poisoned");
    GrasshopperStatus {
        listening: state.last_error.as_deref().map(|e| !e.starts_with("Unable to bind")).unwrap_or(true),
        endpoint: format!("ws://{}:{}", GH_HOST, GH_PORT),
        connected_clients: state.connected_clients,
        last_source: state.last_source.clone(),
        last_update_ms: state.last_update_ms,
        last_error: state.last_error.clone(),
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn validate_toolpath_message(text: &str) -> Result<(ToolpathEnvelope, Value), String> {
    let value: Value = serde_json::from_str(text).map_err(|error| format!("Invalid JSON: {error}"))?;
    let envelope: ToolpathEnvelope = serde_json::from_value(value.clone())
        .map_err(|error| format!("Invalid toolpath message: {error}"))?;

    if envelope.message_type != "toolpath.update" {
        return Err(format!("Unsupported message type: {}", envelope.message_type));
    }
    if envelope.source.trim().is_empty() {
        return Err("source must not be empty".into());
    }
    if envelope.paths.is_empty() {
        return Err("paths must contain at least one path".into());
    }

    for (index, path) in envelope.paths.iter().enumerate() {
        let points = path
            .get("points")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("paths[{index}].points is required"))?;
        if points.len() < 2 {
            return Err(format!("paths[{index}].points needs at least 2 points"));
        }
        for (point_index, point) in points.iter().enumerate() {
            let xyz = point
                .as_array()
                .ok_or_else(|| format!("paths[{index}].points[{point_index}] must be an XYZ array"))?;
            if xyz.len() < 3 || !xyz.iter().take(3).all(Value::is_number) {
                return Err(format!(
                    "paths[{index}].points[{point_index}] must contain numeric X, Y and Z"
                ));
            }
        }
    }

    Ok((envelope, value))
}

async fn run_grasshopper_server(app: tauri::AppHandle, shared: SharedGrasshopperState) {
    let address = format!("{}:{}", GH_HOST, GH_PORT);
    let listener = match TcpListener::bind(&address).await {
        Ok(listener) => listener,
        Err(error) => {
            let message = format!("Unable to bind Grasshopper WebSocket on {address}: {error}");
            eprintln!("{message}");
            if let Ok(mut state) = shared.lock() {
                state.last_error = Some(message.clone());
            }
            let _ = app.emit("grasshopper-bridge-error", message);
            return;
        }
    };

    println!("Pathloom Grasshopper WebSocket: ws://{address}");
    let _ = app.emit("grasshopper-bridge-listening", format!("ws://{address}"));

    loop {
        let (stream, peer) = match listener.accept().await {
            Ok(connection) => connection,
            Err(error) => {
                eprintln!("Grasshopper socket accept failed: {error}");
                continue;
            }
        };

        let app = app.clone();
        let shared = shared.clone();
        tauri::async_runtime::spawn(async move {
            let websocket = match accept_async(stream).await {
                Ok(socket) => socket,
                Err(error) => {
                    eprintln!("Grasshopper WebSocket handshake failed from {peer}: {error}");
                    return;
                }
            };

            if let Ok(mut state) = shared.lock() {
                state.connected_clients += 1;
                state.last_error = None;
            }
            let _ = app.emit("grasshopper-client-count", grasshopper_client_count(&shared));

            let (_write, mut read) = websocket.split();
            while let Some(message) = read.next().await {
                match message {
                    Ok(Message::Text(text)) => match validate_toolpath_message(&text) {
                        Ok((envelope, payload)) => {
                            if let Ok(mut state) = shared.lock() {
                                state.last_source = Some(envelope.source.clone());
                                state.last_update_ms = Some(now_ms());
                                state.last_error = None;
                            }
                            let _ = envelope.label.as_deref();
                            let _ = app.emit("grasshopper-toolpath-update", payload);
                        }
                        Err(error) => {
                            if let Ok(mut state) = shared.lock() {
                                state.last_error = Some(error.clone());
                            }
                            let _ = app.emit("grasshopper-message-error", error);
                        }
                    },
                    Ok(Message::Close(_)) => break,
                    Ok(Message::Ping(_)) | Ok(Message::Pong(_)) | Ok(Message::Binary(_)) | Ok(Message::Frame(_)) => {}
                    Err(error) => {
                        let message = format!("Grasshopper WebSocket error: {error}");
                        if let Ok(mut state) = shared.lock() {
                            state.last_error = Some(message.clone());
                        }
                        let _ = app.emit("grasshopper-bridge-error", message);
                        break;
                    }
                }
            }

            if let Ok(mut state) = shared.lock() {
                state.connected_clients = state.connected_clients.saturating_sub(1);
            }
            let _ = app.emit("grasshopper-client-count", grasshopper_client_count(&shared));
        });
    }
}

fn grasshopper_client_count(shared: &SharedGrasshopperState) -> usize {
    shared.lock().map(|state| state.connected_clients).unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let grasshopper_state: SharedGrasshopperState = Arc::new(Mutex::new(GrasshopperState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_menu_event(|app, event| {
            if let Some(action) = event.id().as_ref().strip_prefix("project-") { let _ = app.emit("project-menu", action); }
            if event.id().as_ref() == "load_ukigara_clock" {
                let _ = app.emit("load-ukigara-clock", ());
            }
        })
        .manage(grasshopper_state.clone())
        .manage(Arc::new(codex_bridge::CodexBridge::default()))
        .setup(move |app| {
            let open = MenuItemBuilder::with_id("project-open", "Open…").accelerator("CmdOrCtrl+O").build(app)?;
            let save = MenuItemBuilder::with_id("project-save", "Save").accelerator("CmdOrCtrl+S").build(app)?;
            let save_as = MenuItemBuilder::with_id("project-save-as", "Save As…").accelerator("CmdOrCtrl+Shift+S").build(app)?;
            let settings = MenuItemBuilder::with_id("project-settings", "Settings…").accelerator("CmdOrCtrl+,").build(app)?;
            let file_menu = SubmenuBuilder::new(app, "File").build()?;
            let samples_menu = SubmenuBuilder::new(app, "Samples")
                .text("load_ukigara_clock", "Load Ukigara Clock")
                .build()?;
            if let Some(menu) = app.menu() {
                let mut file_found = false;
                for item in menu.items()? {
                    if let tauri::menu::MenuItemKind::Submenu(submenu) = item {
                        if submenu.text()? == "File" {
                            submenu.insert(&open, 0)?;
                            submenu.insert(&save, 1)?;
                            submenu.insert(&save_as, 2)?;
                            submenu.insert(&settings, 3)?;
                            file_found = true;
                            break;
                        }
                    }
                }
                if !file_found { file_menu.append_items(&[&open, &save, &save_as, &settings])?; menu.insert(&file_menu, 1)?; }
                menu.append(&samples_menu)?;
            } else {
                file_menu.append_items(&[&open, &save, &save_as, &settings])?;
                let menu = MenuBuilder::new(app).item(&file_menu).item(&samples_menu).build()?;
                app.set_menu(menu)?;
            }
            let app_handle = app.handle().clone();
            let shared = grasshopper_state.clone();
            tauri::async_runtime::spawn(run_grasshopper_server(app_handle, shared));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![runtime_info, grasshopper_bridge_status, read_live_toolpath, choose_live_toolpath, project_files::save_pathloom_project, project_files::open_pathloom_project, project_files::cad_library, codex_bridge::codex_status, codex_bridge::codex_login, codex_bridge::codex_cancel, codex_bridge::codex_propose])
        .run(tauri::generate_context!())
        .expect("error while running Pathloom");
}
