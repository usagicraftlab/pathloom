use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn save_pathloom_project(
    app: AppHandle,
    content: String,
    current_path: Option<String>,
) -> Result<Option<String>, String> {
    let parsed: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if parsed["format"] != "pathloom" || parsed["version"] != 1 {
        return Err("Invalid project format".into());
    }
    let path = if let Some(path) = current_path {
        let path = std::path::PathBuf::from(path);
        if !path.is_absolute() || path.extension().and_then(|p| p.to_str()) != Some("pathloom") {
            return Err("Invalid project path".into());
        }
        path
    } else {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.dialog()
            .file()
            .set_title("Save Pathloom project")
            .set_file_name("Untitled.pathloom")
            .add_filter("Pathloom project", &["pathloom"])
            .save_file(move |file| {
                let _ = sender.send(file);
            });
        let Some(file) = receiver.await.map_err(|e| e.to_string())? else {
            return Ok(None);
        };
        let mut path = file.into_path().map_err(|e| e.to_string())?;
        if path.extension().and_then(|p| p.to_str()) != Some("pathloom") {
            path.set_extension("pathloom");
        }
        path
    };
    tauri::async_runtime::spawn_blocking(move || {
        // Write next to the destination, then atomically replace it.
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let temporary =
            path.with_extension(format!("pathloom.{}.{}.tmp", std::process::id(), stamp));
        std::fs::write(&temporary, content).map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_pathloom_project(app: AppHandle) -> Result<Option<Value>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Open Pathloom project")
        .add_filter("Pathloom project", &["pathloom"])
        .pick_file(move |file| {
            let _ = sender.send(file);
        });
    let Some(file) = receiver.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if metadata.len() > 200_000_000 {
            return Err("Project exceeds 200 MB".into());
        }
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        Ok(Some(
            serde_json::json!({"path": path.to_string_lossy(), "content":content}),
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cad_library(app: AppHandle, content: Option<String>) -> Result<String, String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = directory.join("cad-library-v1.json");
        if let Some(content) = content {
            if content.len() > 5_000_000 {
                return Err("Library is too large".into());
            }
            let parsed: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            if !parsed.is_array() {
                return Err("Invalid library".into());
            }
            std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
            let temp = directory.join("cad-library-v1.tmp");
            std::fs::write(&temp, &content).map_err(|e| e.to_string())?;
            std::fs::rename(temp, path).map_err(|e| e.to_string())?;
            Ok(content)
        } else if path.exists() {
            std::fs::read_to_string(path).map_err(|e| e.to_string())
        } else {
            Ok("[]".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
