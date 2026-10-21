use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

fn gcode_save_path(mut path: std::path::PathBuf) -> std::path::PathBuf {
    if !path
        .extension()
        .and_then(|v| v.to_str())
        .is_some_and(|v| v.eq_ignore_ascii_case("gcode"))
    {
        let mut filename = path.file_name().unwrap_or_default().to_os_string();
        filename.push(".gcode");
        path.set_file_name(filename);
    }
    path
}

pub(crate) fn write_atomic(path: &std::path::Path, content: &str) -> Result<(), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temporary = path.with_extension(format!(
        "{}.{}.{}.tmp",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("pathloom"),
        std::process::id(),
        stamp
    ));
    let result = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_gcode_file(
    app: AppHandle,
    content: String,
    filename: String,
) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Save G-code")
        .set_file_name(filename)
        .add_filter("G-code", &["gcode"])
        .save_file(move |file| {
            let _ = sender.send(file);
        });
    let Some(file) = receiver.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = gcode_save_path(file.into_path().map_err(|e| e.to_string())?);
    tauri::async_runtime::spawn_blocking(move || {
        write_atomic(&path, &content)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_pathloom_project(
    app: AppHandle,
    content: String,
    current_path: Option<String>,
) -> Result<Option<String>, String> {
    if content.len() > 200_000_000 {
        return Err("Project exceeds 200 MB; reduce embedded geometry before saving".into());
    }
    let parsed: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if parsed["format"] != "pathloom" || (parsed["version"] != 1 && parsed["version"] != 2) {
        return Err("Invalid project format".into());
    }
    let path = if let Some(path) = current_path {
        let path = std::path::PathBuf::from(path);
        if !path.is_absolute()
            || !path
                .extension()
                .and_then(|p| p.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("pathloom"))
        {
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
        if !path
            .extension()
            .and_then(|p| p.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("pathloom"))
        {
            path.set_extension("pathloom");
        }
        path
    };
    tauri::async_runtime::spawn_blocking(move || {
        write_atomic(&path, &content)?;
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
            if content.len() > 200_000_000 {
                return Err("Component library exceeds 200 MB".into());
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

#[cfg(test)]
mod gcode_tests {
    use super::*;
    #[test]
    fn export_extension_preserves_names_and_accepts_uppercase() {
        assert_eq!(
            gcode_save_path("/tmp/part.v2".into()),
            std::path::PathBuf::from("/tmp/part.v2.gcode")
        );
        assert_eq!(
            gcode_save_path("/tmp/part.GCODE".into()),
            std::path::PathBuf::from("/tmp/part.GCODE")
        );
    }
    #[test]
    fn export_writes_exact_content_and_replaces_existing_file() {
        let path =
            std::env::temp_dir().join(format!("pathloom-save-test-{}.gcode", std::process::id()));
        write_atomic(&path, "old").unwrap();
        let content = "; thumbnail begin\nG1 X1 Y2 E0.3\nM601\n";
        write_atomic(&path, content).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), content);
        std::fs::remove_file(path).unwrap();
    }
}

#[tauri::command]
pub async fn cad_shape_library(app: AppHandle, content: Option<String>) -> Result<String, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = root.join("cad-shape-library.json");
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(content) = content {
            if content.len() > 200_000_000 {
                return Err("CAD_RESOURCE_LIMIT: library exceeds 200 MB".into());
            }
            let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            if !value.is_array() {
                return Err("Invalid shape library".into());
            }
            write_atomic(&path, &content)?;
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
#[tauri::command]
pub async fn cad_command_library(
    app: AppHandle,
    content: Option<String>,
) -> Result<String, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = root.join("cad-command-library.json");
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(content) = content {
            if content.len() > 200_000_000 {
                return Err("CAD_RESOURCE_LIMIT: library exceeds 200 MB".into());
            }
            let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            if !value.is_array() {
                return Err("Invalid shape library".into());
            }
            write_atomic(&path, &content)?;
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
#[tauri::command]
pub async fn cad_recovery(
    app: AppHandle,
    content: Option<String>,
    discard: Option<bool>,
) -> Result<Option<String>, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = root.join("cad-recovery.json");
    tauri::async_runtime::spawn_blocking(move || {
        if discard == Some(true) {
            if path.exists() {
                std::fs::remove_file(path).map_err(|e| e.to_string())?
            }
            return Ok(None);
        }
        if let Some(content) = content {
            if content.len() > 200_000_000 {
                return Err("CAD_RESOURCE_LIMIT: recovery exceeds 200 MB".into());
            }
            let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            if value["format"] != "pathloom-cad-document" || value["schemaVersion"] != 1 {
                return Err("Invalid recovery document".into());
            }
            write_atomic(&path, &content)?;
            Ok(Some(content))
        } else if path.exists() {
            std::fs::read_to_string(path)
                .map(Some)
                .map_err(|e| e.to_string())
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
