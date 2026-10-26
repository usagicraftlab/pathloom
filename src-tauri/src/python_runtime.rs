//! Interpreter selection shared by the CAD daemon and existing STEP bridge.
use std::{ffi::OsString, path::Path};
use tauri::Manager;

fn select_python(override_path: Option<OsString>, config: &Path, local: &Path) -> Result<OsString, String> {
    if let Some(value) = override_path.filter(|v| !v.is_empty()) {
        return Ok(value);
    }
    if config.is_file() {
        let content = std::fs::read_to_string(config)
            .map_err(|e| format!("CAD_RUNTIME_MISSING: cannot read runtime configuration: {e}"))?;
        let value: serde_json::Value = serde_json::from_str(&content)
            .map_err(|_| "CAD_RUNTIME_MISSING: invalid runtime configuration; run npm run cad:setup")?;
        if value["schemaVersion"] != 1 {
            return Err("CAD_RUNTIME_MISSING: unsupported runtime configuration; run npm run cad:setup".into());
        }
        let path = value["python"].as_str().map(Path::new)
            .filter(|p| p.is_absolute() && p.is_file())
            .ok_or("CAD_RUNTIME_MISSING: configured Python is unavailable; run npm run cad:setup or set PATHLOOM_BREP_PYTHON")?;
        return Ok(path.as_os_str().to_owned());
    }
    if local.is_file() { return Ok(local.as_os_str().to_owned()); }
    Ok(if cfg!(windows) { "python" } else { "python3" }.into())
}

pub(crate) fn executable(app: &tauri::AppHandle) -> Result<OsString, String> {
    let config = app.path().app_data_dir().map_err(|e| e.to_string())?.join("cad-runtime.json");
    let local = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../.pathloom-runtime/python")
        .join(if cfg!(windows) { "Scripts/python.exe" } else { "bin/python" });
    select_python(std::env::var_os("PATHLOOM_BREP_PYTHON"), &config, &local)
}

#[cfg(test)]
mod tests {
    use super::*;
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    fn directory() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("pathloom-python-{}-{}", std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
        std::fs::create_dir_all(&path).unwrap();path
    }
    #[test]
    fn explicit_interpreter_has_precedence_over_invalid_saved_config() {
        let root=directory();let config=root.join("config.json");std::fs::write(&config,"bad").unwrap();
        assert_eq!(select_python(Some("chosen-python".into()),&config,&root.join("local")).unwrap(),OsString::from("chosen-python"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn saved_absolute_interpreter_works_without_the_build_repository() {
        let root=directory();let python=root.join("python");std::fs::write(&python,"").unwrap();
        let config=root.join("config.json");
        std::fs::write(&config,serde_json::json!({"schemaVersion":1,"python":python}).to_string()).unwrap();
        assert_eq!(select_python(None,&config,&root.join("missing-build-repo")).unwrap(),python.as_os_str().to_owned());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn stale_or_relative_config_is_reported_instead_of_silently_selecting_another_kernel() {
        let root=directory();let config=root.join("config.json");
        for python in ["relative/python".to_owned(),root.join("missing").to_string_lossy().into_owned()] {
            std::fs::write(&config,serde_json::json!({"schemaVersion":1,"python":python}).to_string()).unwrap();
            assert!(select_python(None,&config,&root.join("local")).unwrap_err().contains("cad:setup"));
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn development_fallback_is_preserved_when_no_configuration_exists() {
        let root=directory();let local=root.join("python");std::fs::write(&local,"").unwrap();
        assert_eq!(select_python(None,&root.join("no-config"),&local).unwrap(),local.as_os_str().to_owned());
        std::fs::remove_dir_all(root).unwrap();
    }
}
