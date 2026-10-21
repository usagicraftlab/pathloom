//! Dedicated persistent CAD daemon. Kill/restart never touches AI or printer tasks.
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
const MAX_LINE: usize = 256 * 1024 * 1024;
struct Session {
    child: Mutex<Child>,
    input: Arc<Mutex<ChildStdin>>,
    output: Mutex<mpsc::Receiver<Result<Value, String>>>,
    gate: Mutex<()>,
    epoch: u64,
    hello: Mutex<Value>,
}
impl Session {
    fn kill(&self) {
        if let Ok(mut c) = self.child.lock() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
    fn call(&self, mut message: Value) -> Result<Value, String> {
        let _gate = self.gate.lock().map_err(|e| e.to_string())?;
        let id = SystemId::next();
        message["id"] = json!(id);
        let bytes = serde_json::to_vec(&message).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_LINE {
            return Err("CAD_RESOURCE_LIMIT: request exceeds 256 MiB".into());
        }
        let input = self.input.clone();
        // The watchdog must cover blocked stdin writes too, not only stdout.
        let writer = std::thread::spawn(move || -> Result<(), String> {
            let mut stdin = input.lock().map_err(|e| e.to_string())?;
            stdin
                .write_all(&bytes)
                .and_then(|_| stdin.write_all(b"\n"))
                .and_then(|_| stdin.flush())
                .map_err(|e| format!("CAD_RUNTIME_CRASHED: {e}"))
        });
        let reply = self
            .output
            .lock()
            .map_err(|e| e.to_string())?
            .recv_timeout(Duration::from_secs(60));
        let outcome = match reply {
            Ok(Ok(value)) => {
                if value["id"] != json!(id) {
                    self.kill();
                    return self.finish_writer(
                        writer,
                        Err("CAD_RUNTIME_CRASHED: mismatched protocol reply".into()),
                    );
                }
                if value["ok"] == true {
                    Ok(value["result"].clone())
                } else {
                    Err(value["error"].to_string())
                }
            }
            Ok(Err(e)) => {
                self.kill();
                Err(e)
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.kill();
                Err("CAD_RESOURCE_LIMIT: CAD operation exceeded 60 seconds; reduce the input or accuracy and retry".into())
            }
            Err(e) => {
                self.kill();
                Err(format!("CAD_RUNTIME_CRASHED: {e}"))
            }
        };
        self.finish_writer(writer, outcome)
    }
    fn finish_writer(
        &self,
        writer: std::thread::JoinHandle<Result<(), String>>,
        outcome: Result<Value, String>,
    ) -> Result<Value, String> {
        let sent = writer
            .join()
            .map_err(|_| "CAD_RUNTIME_CRASHED: input writer failed".to_string())?;
        if outcome.is_err() {
            return outcome;
        }
        sent?;
        outcome
    }
}
struct SystemId;
impl SystemId {
    fn next() -> u64 {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        NEXT.fetch_add(1, Ordering::Relaxed)
    }
}
#[derive(Default)]
pub struct CadRuntime {
    session: Mutex<Option<Arc<Session>>>,
    epoch: AtomicU64,
    cancelled: Mutex<HashSet<String>>,
}
impl CadRuntime {
    fn start(&self, app: &tauri::AppHandle) -> Result<Arc<Session>, String> {
        let mut guard = self.session.lock().map_err(|e| e.to_string())?;
        if let Some(s) = guard.as_ref() {
            if s.child
                .lock()
                .map_err(|e| e.to_string())?
                .try_wait()
                .map_err(|e| e.to_string())?
                .is_none()
            {
                return Ok(s.clone());
            }
        }
        let root = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("cad-runtime-v1");
        std::fs::create_dir_all(root.join("cad_operations")).map_err(|e| e.to_string())?;
        for (file, content) in [
            (
                "cad_runtime.py",
                include_str!("../../native/cad_runtime.py"),
            ),
            (
                "cad_operations/__init__.py",
                include_str!("../../native/cad_operations/__init__.py"),
            ),
            (
                "occt_brep_bridge.py",
                include_str!("../../native/occt_brep_bridge.py"),
            ),
        ] {
            let path = root.join(file);
            std::fs::write(path, content).map_err(|e| e.to_string())?;
        }
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
            } else {
                "python3".into()
            }
        });
        let mut cmd = Command::new(python);
        cmd.arg("-u").arg(root.join("cad_runtime.py")).env_clear();
        for key in [
            "PATH",
            "SystemRoot",
            "TMPDIR",
            "TEMP",
            "LD_LIBRARY_PATH",
            "DYLD_LIBRARY_PATH",
        ] {
            if let Some(v) = std::env::var_os(key) {
                cmd.env(key, v);
            }
        }
        cmd.env("PYTHONDONTWRITEBYTECODE", "1");
        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("CAD_RUNTIME_MISSING: run npm run cad:setup: {e}"))?;
        let input = child.stdin.take().ok_or("CAD stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("CAD stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("CAD stderr unavailable")?;
        let (tx, rx) = mpsc::sync_channel(2);
        std::thread::spawn(move || {
            let mut r = BufReader::new(stdout);
            loop {
                let mut bytes = Vec::new();
                let read = std::io::Read::take(&mut r, (MAX_LINE + 1) as u64)
                    .read_until(b'\n', &mut bytes);
                match read {
                    Ok(0) => {
                        let _ = tx.send(Err("CAD_RUNTIME_CRASHED: closed stdout".into()));
                        break;
                    }
                    Ok(_) if bytes.len() <= MAX_LINE => {
                        let v = serde_json::from_slice(&bytes)
                            .map_err(|e| format!("CAD_RUNTIME_CRASHED: invalid JSONL: {e}"));
                        let bad = v.is_err();
                        if tx.send(v).is_err() || bad {
                            break;
                        }
                    }
                    _ => {
                        let _ = tx.send(Err(
                            "CAD_RESOURCE_LIMIT: invalid or oversized response".into()
                        ));
                        break;
                    }
                }
            }
        });
        // Drain without retaining potentially unbounded library diagnostics.
        std::thread::spawn(move || {
            let _ = std::io::copy(&mut BufReader::new(stderr), &mut std::io::sink());
        });
        let epoch = self.epoch.fetch_add(1, Ordering::SeqCst) + 1;
        let s = Arc::new(Session {
            child: Mutex::new(child),
            input: Arc::new(Mutex::new(input)),
            output: Mutex::new(rx),
            gate: Mutex::new(()),
            epoch,
            hello: Mutex::new(Value::Null),
        });
        let mut hello = s.call(json!({"type":"hello"})).map_err(|e|format!("CAD_RUNTIME_MISSING: CAD initialization failed. Run npm run cad:setup or configure PATHLOOM_BREP_PYTHON. {e}"))?;
        if hello["protocolVersion"] != 1 {
            s.kill();
            return Err("CAD_SCHEMA_UNSUPPORTED: incompatible runtime protocol".into());
        }
        let probes = s.call(json!({"type":"probe"}))?;
        hello["verifiedOptions"] = probes["probes"].clone();
        hello["runtimeEpoch"] = json!(epoch);
        *s.hello.lock().map_err(|e| e.to_string())? = hello;
        *guard = Some(s.clone());
        Ok(s)
    }
    fn stop(&self) {
        if let Ok(mut s) = self.session.lock() {
            if let Some(s) = s.take() {
                s.kill()
            }
        }
    }
}
impl Drop for CadRuntime {
    fn drop(&mut self) {
        self.stop()
    }
}
#[tauri::command]
pub async fn cad_runtime_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<CadRuntime>>,
) -> Result<Value, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let s = runtime.start(&app)?;
        let value = s.hello.lock().map_err(|e| e.to_string())?.clone();
        Ok(value)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cad_runtime_status(state: tauri::State<'_, Arc<CadRuntime>>) -> Result<Value, String> {
    let g = state.session.lock().map_err(|e| e.to_string())?;
    if let Some(s) = g.as_ref() {
        let mut v = s.hello.lock().map_err(|e| e.to_string())?.clone();
        v["running"] = json!(s
            .child
            .lock()
            .map_err(|e| e.to_string())?
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_none());
        Ok(v)
    } else {
        Ok(json!({"running":false}))
    }
}
#[tauri::command]
pub async fn cad_runtime_restart(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<CadRuntime>>,
) -> Result<Value, String> {
    state.stop();
    cad_runtime_start(app, state).await
}
#[tauri::command]
pub async fn cad_import_asset(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<CadRuntime>>,
    asset: Value,
    hash: String,
) -> Result<Value, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime
            .start(&app)?
            .call(json!({"type":"import","asset":asset,"hash":hash}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn cad_export_assets(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<CadRuntime>>,
    handles: Vec<String>,
) -> Result<Value, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime
            .start(&app)?
            .call(json!({"type":"export","handles":handles}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn cad_release_handles(
    state: tauri::State<'_, Arc<CadRuntime>>,
    handles: Vec<String>,
) -> Result<Value, String> {
    let session = state
        .session
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .cloned();
    if let Some(session) = session {
        tauri::async_runtime::spawn_blocking(move || {
            session.call(json!({"type":"release","handles":handles}))
        })
        .await
        .map_err(|e| e.to_string())?
    } else {
        Ok(json!({"released":false}))
    }
}
#[tauri::command]
pub fn cad_cancel(state: tauri::State<'_, Arc<CadRuntime>>, request_id: String) {
    if let Ok(mut c) = state.cancelled.lock() {
        if c.len() > 1024 {
            c.clear()
        }
        c.insert(request_id);
    }
    state.stop();
}
#[tauri::command]
pub fn cad_evaluate(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<CadRuntime>>,
    request: Value,
) -> Result<Value, String> {
    let id = request["requestId"]
        .as_str()
        .ok_or("Missing requestId")?
        .to_owned();
    let runtime = state.inner().clone();
    let ack = json!({"requestId":id,"accepted":true});
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| {
            if runtime
                .cancelled
                .lock()
                .map_err(|e| e.to_string())?
                .remove(&id)
            {
                return Err("CAD_CANCELLED".to_string());
            }
            let s = runtime.start(&app)?;
            if request["runtimeEpoch"] != json!(s.epoch) {
                return Err(
                    "CAD_RUNTIME_CRASHED: runtime epoch changed; reload exact assets".into(),
                );
            }
            s.call(json!({"type":"evaluate","request":request}))
        })();
        let value = match outcome {
            Ok(mut value) => {
                if runtime
                    .cancelled
                    .lock()
                    .map(|mut c| c.remove(&id))
                    .unwrap_or(true)
                {
                    value["status"] = json!("cancelled");
                    value["outputs"] = json!([])
                }
                value
            }
            Err(error) => {
                let mut v = request.clone();
                let code = ["CAD_RESOURCE_LIMIT", "CAD_CANCELLED", "CAD_RUNTIME_MISSING"]
                    .into_iter()
                    .find(|code| error.contains(code))
                    .unwrap_or("CAD_RUNTIME_CRASHED");
                v["status"] = json!(if code == "CAD_CANCELLED" {
                    "cancelled"
                } else {
                    "failed"
                });
                v["outputs"] = json!([]);
                v["diagnostics"] = json!([{"code":code,"severity":"error","message":error,"actions":[{"id":"restartRuntime","label":"CADランタイムを再起動"},{"id":"retry","label":"再計算"}]}]);
                v
            }
        };
        let _ = app.emit("cad-job-result", value);
    });
    Ok(ack)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    fn session(script: &str) -> Arc<Session> {
        let mut child = Command::new("python3")
            .args(["-u", "-c", script])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let input = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let result = line
                    .map_err(|e| e.to_string())
                    .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()));
                if tx.send(result).is_err() {
                    return;
                }
            }
        });
        Arc::new(Session {
            child: Mutex::new(child),
            input: Arc::new(Mutex::new(input)),
            output: Mutex::new(rx),
            gate: Mutex::new(()),
            epoch: 1,
            hello: Mutex::new(Value::Null),
        })
    }
    #[test]
    fn persistent_requests() {
        let s=session("import sys,json\nfor line in sys.stdin:\n m=json.loads(line);print(json.dumps(dict(id=m['id'],ok=True,result=m)),flush=True)");
        for i in 0..3 {
            let r = s.call(json!({"value":i})).unwrap();
            assert_eq!(r["value"], i)
        }
        s.kill();
    }
    #[test]
    fn rejects_mismatched_reply() {
        let s=session("import sys,json\nfor line in sys.stdin:\n print(json.dumps(dict(id=999999,ok=True,result={})),flush=True)");
        assert!(s.call(json!({})).unwrap_err().contains("mismatched"));
        s.kill();
    }
    #[test]
    fn hard_kill_unblocks_pending_read() {
        let s = session("import sys,time\nfor line in sys.stdin: time.sleep(120)");
        let c = s.clone();
        let start = std::time::Instant::now();
        let job = std::thread::spawn(move || c.call(json!({})));
        std::thread::sleep(Duration::from_millis(60));
        s.kill();
        assert!(job.join().unwrap().is_err());
        assert!(start.elapsed() < Duration::from_secs(2));
    }
    #[test]
    fn hard_kill_unblocks_full_stdin_pipe() {
        let s = session("import time\ntime.sleep(120)");
        let c = s.clone();
        let start = std::time::Instant::now();
        let job = std::thread::spawn(move || c.call(json!({"payload":"x".repeat(8*1024*1024)})));
        std::thread::sleep(Duration::from_millis(60));
        s.kill();
        assert!(job.join().unwrap().is_err());
        assert!(start.elapsed() < Duration::from_secs(2));
    }
}
