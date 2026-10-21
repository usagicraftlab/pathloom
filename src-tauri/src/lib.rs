mod cad_process;
mod cad_runtime;
mod codex_bridge;
mod grasshopper_brep;
mod printer;
mod project_files;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager, State,
};
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
    brep_updates: std::collections::HashMap<String, Value>,
    brep_revision: u64,
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
    app.dialog()
        .file()
        .set_title("Choose a live toolpath file")
        .add_filter("Toolpath", &["toolpath", "json"])
        .pick_files(move |files| {
            let result = files
                .map(|files| {
                    files
                        .into_iter()
                        .map(|file| {
                            file.into_path()
                                .map(|path| path.to_string_lossy().into_owned())
                                .map_err(|error| error.to_string())
                        })
                        .collect::<Result<Vec<_>, String>>()
                })
                .transpose();
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
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if !extension.eq_ignore_ascii_case("toolpath") && !extension.eq_ignore_ascii_case("json") {
            return Err("Choose a .toolpath or .json file".into());
        }
        use std::io::Read;
        let file =
            std::fs::File::open(path).map_err(|error| format!("Unable to read file: {error}"))?;
        let mut text = String::new();
        file.take(128 * 1024 * 1024 + 1)
            .read_to_string(&mut text)
            .map_err(|error| format!("Unable to read file: {error}"))?;
        if text.len() > 128 * 1024 * 1024 {
            return Err("Toolpath file exceeds 128 MB".into());
        }
        Ok(text)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn run_editable_cad(app: &tauri::AppHandle, request: &Value) -> Result<Value, String> {
    use std::process::Command;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("native");
    std::fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    let script = cache.join("occt_brep_bridge.py");
    let staged_script = cache.join(format!(
        "occt-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos()
    ));
    std::fs::write(
        &staged_script,
        include_bytes!("../../native/occt_brep_bridge.py"),
    )
    .map_err(|error| error.to_string())?;
    std::fs::rename(&staged_script, &script).map_err(|error| error.to_string())?;
    let local = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../.pathloom-runtime/python")
        .join(if cfg!(windows) {
            "Scripts/python.exe"
        } else {
            "bin/python"
        });
    let python = std::env::var_os("PATHLOOM_BREP_PYTHON").unwrap_or_else(|| {
        if local.is_file() {
            local.into_os_string()
        } else if cfg!(windows) {
            "python".into()
        } else {
            "python3".into()
        }
    });
    let mut command = Command::new(python);
    command.arg(script);
    let output = cad_process::run(
        command,
        serde_json::to_vec(request).map_err(|e| e.to_string())?,
        request
            .get("requestId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        std::time::Duration::from_secs(25),
        256 * 1024 * 1024,
    )?;
    let result: Value = serde_json::from_slice(&output)
        .map_err(|error| format!("Invalid CAD runtime response: {error}"))?;
    if result.get("success").and_then(Value::as_bool) != Some(true) {
        return Err(result
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("CAD operation failed")
            .to_string());
    }
    result
        .get("shape")
        .cloned()
        .ok_or_else(|| "CAD shape was not returned".into())
}

#[tauri::command]
async fn choose_editable_step(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Import editable STEP")
        .add_filter("STEP model", &["step", "stp"])
        .pick_file(move |file| {
            let _ =
                sender.send(file.map(|file| file.into_path().map_err(|error| error.to_string())));
        });
    let Some(path) = receiver.await.map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    let path = path?;
    if !path.is_absolute() {
        return Err("Choose an absolute STEP path".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        run_editable_cad(&app, &serde_json::json!({"action":"import","path":path})).map(Some)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn cancel_cad_request(request_id: String) {
    cad_process::cancel(&request_id);
}

#[tauri::command]
async fn slice_step_brep(
    app: tauri::AppHandle,
    brep: Value,
    layer_height: f64,
    tolerance: f64,
    request_id: Option<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||run_editable_cad(&app,&serde_json::json!({"action":"slice","brep":brep,"layerHeight":layer_height,"tolerance":tolerance,"requestId":request_id}))).await.map_err(|error|error.to_string())?
}

#[tauri::command]
async fn edit_step_faces(
    app: tauri::AppHandle,
    brep: Value,
    face_indices: Vec<usize>,
    offset: Vec<f64>,
    name: String,
    whole: Option<bool>,
) -> Result<Value, String> {
    if offset.len() != 3
        || offset.iter().any(|v| !v.is_finite() || v.abs() > 1000.0)
        || (!whole.unwrap_or(false) && face_indices.is_empty())
        || face_indices.len() > 200000
        || name.len() > 1024
    {
        return Err("Invalid CAD face movement".into());
    }
    tauri::async_runtime::spawn_blocking(move || run_editable_cad(&app, &serde_json::json!({"action":if whole.unwrap_or(false) {"translate"} else {"move"},"brep":brep,"faceIndices":face_indices,"offset":offset,"name":name}))).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn move_step_brep_faces(
    app: tauri::AppHandle,
    asset_id: String,
    brep_index: usize,
    face_indices: Vec<usize>,
    dx: f64,
    dy: f64,
) -> Result<Value, String> {
    if asset_id.is_empty()
        || asset_id.len() > 96
        || !asset_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '-')
    {
        return Err("Invalid CAD asset reference".into());
    }
    if face_indices.is_empty() || face_indices.len() > 200_000 {
        return Err("Select one or more CAD faces".into());
    }
    if !dx.is_finite()
        || !dy.is_finite()
        || dx.abs() > 1000.0
        || dy.abs() > 1000.0
        || dx.hypot(dy) < 1e-8
    {
        return Err("Enter a finite, non-zero X or Y movement within ±1000 mm".into());
    }
    let mut unique = face_indices.clone();
    unique.sort_unstable();
    unique.dedup();
    if unique.len() != face_indices.len() {
        return Err("CAD face selection contains duplicates".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let cache = app
            .path()
            .app_cache_dir()
            .map_err(|error| error.to_string())?
            .join("native");
        let assets = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("brep-assets");
        std::fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
        let script = cache.join("step_brep_bridge.py");
        std::fs::write(&script, include_bytes!("../../native/step_brep_bridge.py"))
            .map_err(|error| format!("Unable to prepare the native B-rep bridge: {error}"))?;
        let asset_path = assets.join(format!("{asset_id}.usda"));
        if !asset_path.is_file() {
            return Err("The editable CAD asset is missing; reimport the STEP file".into());
        }
        let python = std::env::var_os("PATHLOOM_BREP_PYTHON").unwrap_or_else(|| {
            if cfg!(windows) {
                "python".into()
            } else {
                "python3".into()
            }
        });
        let face_list = face_indices
            .iter()
            .map(usize::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let mut command = std::process::Command::new(python);
        command
            .arg(script)
            .arg("move-usd")
            .arg(asset_path)
            .arg(brep_index.to_string())
            .arg(face_list)
            .arg(dx.to_string())
            .arg(dy.to_string());
        let output = cad_process::run(
            command,
            vec![],
            None,
            std::time::Duration::from_secs(25),
            256 * 1024 * 1024,
        )?;
        let value: Value = serde_json::from_slice(&output)
            .map_err(|error| format!("Native B-rep bridge returned invalid JSON: {error}"))?;
        if value.get("success").and_then(Value::as_bool) != Some(true) {
            return Err(value
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("CAD operation failed")
                .to_owned());
        }
        Ok(value)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn import_live_step(
    app: tauri::AppHandle,
    step: String,
    name: String,
) -> Result<Value, String> {
    if step.len() > grasshopper_brep::MAX_STEP_BYTES
        || name.chars().count() > 120
        || !step.trim_start().starts_with("ISO-10303-21;")
        || !step.trim_end().ends_with("END-ISO-10303-21;")
    {
        return Err("Invalid live STEP content".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        run_editable_cad(
            &app,
            &serde_json::json!({"action":"import","step":step,"name":name,"center":false}),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
fn grasshopper_brep_snapshots(
    state: State<'_, SharedGrasshopperState>,
) -> Result<Vec<Value>, String> {
    Ok(state
        .lock()
        .map_err(|error| error.to_string())?
        .brep_updates
        .values()
        .cloned()
        .collect())
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
        listening: state
            .last_error
            .as_deref()
            .map(|e| !e.starts_with("Unable to bind"))
            .unwrap_or(true),
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
    let value: Value =
        serde_json::from_str(text).map_err(|error| format!("Invalid JSON: {error}"))?;
    let envelope: ToolpathEnvelope = serde_json::from_value(value.clone())
        .map_err(|error| format!("Invalid toolpath message: {error}"))?;

    if envelope.message_type != "toolpath.update" {
        return Err(format!(
            "Unsupported message type: {}",
            envelope.message_type
        ));
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
            let xyz = point.as_array().ok_or_else(|| {
                format!("paths[{index}].points[{point_index}] must be an XYZ array")
            })?;
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
            let _ = app.emit(
                "grasshopper-client-count",
                grasshopper_client_count(&shared),
            );

            let (_write, mut read) = websocket.split();
            while let Some(message) = read.next().await {
                match message {
                    Ok(Message::Text(text)) => {
                        match grasshopper_brep::validate(&text) {
                            Ok(Some(mut payload)) => {
                                let source = payload["source"].as_str().unwrap().to_string();
                                let accepted = if let Ok(mut state) = shared.lock() {
                                    let bytes: usize = state
                                        .brep_updates
                                        .iter()
                                        .filter(|(key, _)| *key != &source)
                                        .map(|(_, value)| {
                                            value
                                                .get("step")
                                                .and_then(Value::as_str)
                                                .map(str::len)
                                                .unwrap_or(0)
                                        })
                                        .sum();
                                    if (!state.brep_updates.contains_key(&source)
                                        && state.brep_updates.len() >= 32)
                                        || bytes
                                            + payload
                                                .get("step")
                                                .and_then(Value::as_str)
                                                .map(str::len)
                                                .unwrap_or(0)
                                            > 64 * 1024 * 1024
                                    {
                                        false
                                    } else {
                                        state.brep_revision += 1;
                                        payload["bridgeRevision"] =
                                            Value::from(state.brep_revision);
                                        state.brep_updates.insert(source.clone(), payload.clone());
                                        state.last_source = Some(source);
                                        state.last_update_ms = Some(now_ms());
                                        state.last_error = None;
                                        true
                                    }
                                } else {
                                    false
                                };
                                if accepted {
                                    let _ = app.emit("grasshopper-brep-update", payload);
                                } else {
                                    let _ = app.emit(
                                        "grasshopper-message-error",
                                        "Live B-rep cache limit exceeded; reuse stable source IDs",
                                    );
                                }
                                continue;
                            }
                            Err(error) => {
                                let _ = app.emit("grasshopper-message-error", error);
                                continue;
                            }
                            Ok(None) => {}
                        }
                        match validate_toolpath_message(&text) {
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
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Ok(Message::Ping(_))
                    | Ok(Message::Pong(_))
                    | Ok(Message::Binary(_))
                    | Ok(Message::Frame(_)) => {}
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
            let _ = app.emit(
                "grasshopper-client-count",
                grasshopper_client_count(&shared),
            );
        });
    }
}

fn grasshopper_client_count(shared: &SharedGrasshopperState) -> usize {
    shared
        .lock()
        .map(|state| state.connected_clients)
        .unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let grasshopper_state: SharedGrasshopperState =
        Arc::new(Mutex::new(GrasshopperState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_menu_event(|app, event| {
            if let Some(action) = event.id().as_ref().strip_prefix("project-") {
                let _ = app.emit("project-menu", action);
            }
            if event.id().as_ref() == "load_ukigara_clock" {
                let _ = app.emit("load-ukigara-clock", ());
            }
        })
        .manage(grasshopper_state.clone())
        .manage(Arc::new(codex_bridge::CodexBridge::default()))
        .setup(move |app| {
            let open = MenuItemBuilder::with_id("project-open", "Open…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save = MenuItemBuilder::with_id("project-save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let save_as = MenuItemBuilder::with_id("project-save-as", "Save As…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let settings = MenuItemBuilder::with_id("project-settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;
            let ai_settings =
                MenuItemBuilder::with_id("project-ai-settings", "AI Settings…").build(app)?;
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
                            submenu.insert(&ai_settings, 4)?;
                            file_found = true;
                            break;
                        }
                    }
                }
                if !file_found {
                    file_menu.append_items(&[&open, &save, &save_as, &settings, &ai_settings])?;
                    menu.insert(&file_menu, 1)?;
                }
                menu.append(&samples_menu)?;
            } else {
                file_menu.append_items(&[&open, &save, &save_as, &settings, &ai_settings])?;
                let menu = MenuBuilder::new(app)
                    .item(&file_menu)
                    .item(&samples_menu)
                    .build()?;
                app.set_menu(menu)?;
            }
            let app_handle = app.handle().clone();
            let shared = grasshopper_state.clone();
            tauri::async_runtime::spawn(run_grasshopper_server(app_handle, shared));
            Ok(())
        })
        .manage(Arc::new(cad_runtime::CadRuntime::default()))
        .invoke_handler(tauri::generate_handler![
            cad_runtime::cad_runtime_start,
            cad_runtime::cad_runtime_status,
            cad_runtime::cad_runtime_restart,
            cad_runtime::cad_evaluate,
            cad_runtime::cad_cancel,
            cad_runtime::cad_import_asset,
            cad_runtime::cad_export_assets,
            cad_runtime::cad_release_handles,
            runtime_info,
            printer::printer_connection_get,
            printer::printer_connection_save,
            printer::printer_connection_test,
            printer::printer_upload_gcode,
            grasshopper_bridge_status,
            grasshopper_brep_snapshots,
            import_live_step,
            read_live_toolpath,
            choose_live_toolpath,
            choose_editable_step,
            slice_step_brep,
            cancel_cad_request,
            edit_step_faces,
            move_step_brep_faces,
            project_files::save_gcode_file,
            project_files::save_pathloom_project,
            project_files::open_pathloom_project,
            project_files::cad_library,
            project_files::cad_shape_library,
            project_files::cad_command_library,
            project_files::cad_recovery,
            codex_bridge::codex_status,
            codex_bridge::codex_login,
            codex_bridge::codex_cancel,
            codex_bridge::codex_propose
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pathloom");
}
