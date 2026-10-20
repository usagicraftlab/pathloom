//! Bounded child processes: drain pipes concurrently, kill/reap on cancel or
//! timeout, and never retain unbounded CAD stdout/stderr in memory.
use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

type Requests = Mutex<HashMap<String, Arc<AtomicBool>>>;
static REQUESTS: OnceLock<Requests> = OnceLock::new();
static EARLY_CANCELS: OnceLock<Mutex<VecDeque<String>>> = OnceLock::new();

pub fn cancel(id: &str) {
    if let Ok(requests) = REQUESTS.get_or_init(Default::default).lock() {
        if let Some(flag) = requests.get(id) {
            flag.store(true, Ordering::Relaxed);
        } else if id.len() <= 120 {
            if let Ok(mut early) = EARLY_CANCELS.get_or_init(Default::default).lock() {
                if !early.iter().any(|value| value == id) {
                    early.push_back(id.to_owned());
                }
                while early.len() > 128 {
                    early.pop_front();
                }
            }
        }
    }
}

struct Registration(Option<String>);
impl Drop for Registration {
    fn drop(&mut self) {
        if let Some(id) = &self.0 {
            if let Ok(mut requests) = REQUESTS.get_or_init(Default::default).lock() {
                requests.remove(id);
            }
        }
    }
}

pub fn run(
    mut command: Command,
    payload: Vec<u8>,
    id: Option<String>,
    timeout: Duration,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    if payload.len() > 220 * 1024 * 1024 {
        return Err("CAD request exceeds supported limits".into());
    }
    let flag = Arc::new(AtomicBool::new(false));
    if let Some(id) = &id {
        if id.is_empty() || id.len() > 120 {
            return Err("Invalid CAD request ID".into());
        }
        let mut requests = REQUESTS
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "CAD request lock failed")?;
        if let Ok(mut early) = EARLY_CANCELS.get_or_init(Default::default).lock() {
            if let Some(index) = early.iter().position(|value| value == id) {
                early.remove(index);
                return Err("CAD operation cancelled".into());
            }
        }
        if requests.contains_key(id) {
            return Err("Duplicate CAD request ID".into());
        }
        requests.insert(id.clone(), flag.clone());
    }
    let _registration = Registration(id);
    let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()
        .map_err(|e| format!("Unable to start the CAD runtime. Run npm run cad:setup or configure PATHLOOM_BREP_PYTHON: {e}"))?;
    let input = child.stdin.take().ok_or("CAD stdin unavailable")?;
    let output = child.stdout.take().ok_or("CAD stdout unavailable")?;
    let errors = child.stderr.take().ok_or("CAD stderr unavailable")?;
    let overflow = Arc::new(AtomicBool::new(false));
    let read = |reader: Box<dyn Read + Send>, limit, overflow: Arc<AtomicBool>| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let result = reader.take(limit as u64 + 1).read_to_end(&mut bytes);
            if bytes.len() > limit {
                overflow.store(true, Ordering::Relaxed);
            }
            result.map(|_| bytes)
        })
    };
    let stdout = read(Box::new(output), max_bytes, overflow.clone());
    let stderr = std::thread::spawn(move || {
        let mut reader = errors;
        let mut retained = Vec::new();
        let mut buffer = [0; 8192];
        loop {
            let n = reader.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            let keep = n.min((64usize * 1024).saturating_sub(retained.len()));
            retained.extend_from_slice(&buffer[..keep]);
        }
        Ok::<Vec<u8>, std::io::Error>(retained)
    });
    let stdin = std::thread::spawn(move || {
        let mut input = input;
        input.write_all(&payload)
    });
    let started = Instant::now();
    let outcome = loop {
        if flag.load(Ordering::Relaxed) {
            break Err("CAD operation cancelled".to_string());
        }
        if overflow.load(Ordering::Relaxed) {
            break Err("CAD response exceeds supported limits".to_string());
        }
        if started.elapsed() >= timeout {
            break Err("CAD operation timed out. Try a simpler model or fewer layers.".to_string());
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(e) => break Err(format!("Unable to monitor CAD runtime: {e}")),
        }
    };
    if outcome.is_err() {
        let _ = child.kill();
    }
    let _ = child.wait();
    let written = stdin.join().map_err(|_| "CAD input writer failed")?;
    let output = stdout
        .join()
        .map_err(|_| "CAD output reader failed")?
        .map_err(|e| e.to_string())?;
    let _errors = stderr
        .join()
        .map_err(|_| "CAD error reader failed")?
        .map_err(|e| e.to_string())?;
    let status = outcome?;
    if overflow.load(Ordering::Relaxed) {
        return Err("CAD response exceeds supported limits".into());
    }
    written.map_err(|e| format!("Unable to send CAD request: {e}"))?;
    if !status.success() && output.is_empty() {
        return Err(
            "CAD runtime exited without a result. Check the CAD runtime installation.".into(),
        );
    }
    Ok(output)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    fn shell(script: &str) -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", script]);
        command
    }
    #[test]
    fn drains_output_and_input_without_deadlock() {
        let bytes = run(
            shell("cat"),
            b"request".to_vec(),
            None,
            Duration::from_secs(2),
            64,
        )
        .unwrap();
        assert_eq!(bytes, b"request");
    }
    #[test]
    fn kills_and_reaps_timed_out_process() {
        let started = Instant::now();
        let error = run(
            shell("exec sleep 10"),
            vec![],
            None,
            Duration::from_millis(60),
            64,
        )
        .unwrap_err();
        assert!(error.contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
    #[test]
    fn cancels_running_process_and_releases_registration() {
        let task = std::thread::spawn(|| {
            run(
                shell("exec sleep 10"),
                vec![],
                Some("cancel-test".into()),
                Duration::from_secs(10),
                64,
            )
        });
        for _ in 0..100 {
            if REQUESTS
                .get_or_init(Default::default)
                .lock()
                .unwrap()
                .contains_key("cancel-test")
            {
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        cancel("cancel-test");
        assert!(task.join().unwrap().unwrap_err().contains("cancelled"));
        assert!(!REQUESTS
            .get()
            .unwrap()
            .lock()
            .unwrap()
            .contains_key("cancel-test"));
    }
    #[test]
    fn cancellation_before_process_registration_is_not_lost() {
        cancel("queued-test");
        assert!(run(
            shell("cat"),
            vec![],
            Some("queued-test".into()),
            Duration::from_secs(2),
            64
        )
        .unwrap_err()
        .contains("cancelled"));
    }
    #[test]
    fn bounds_output_before_exhausting_memory() {
        assert!(run(
            shell("printf '123456789'"),
            vec![],
            None,
            Duration::from_secs(2),
            4
        )
        .unwrap_err()
        .contains("limits"));
    }
}
