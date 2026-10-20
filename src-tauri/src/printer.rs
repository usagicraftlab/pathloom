use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};

static SETTINGS_LOCK: Mutex<()> = Mutex::new(());
static UPLOADING: AtomicBool = AtomicBool::new(false);
const SERVICE: &str = "com.usagicraftlab.pathloom.prusalink";

#[derive(Debug, Serialize)]
pub struct PrinterError {
    code: &'static str,
    message: String,
}
type Result<T> = std::result::Result<T, PrinterError>;
fn error(code: &'static str, message: impl Into<String>) -> PrinterError {
    PrinterError {
        code,
        message: message.into(),
    }
}
fn settings_error() -> PrinterError {
    error(
        "settings",
        "Unable to read or save printer connection settings.",
    )
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AuthMode {
    ApiKey,
    Digest,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub base_url: String,
    pub auth_mode: AuthMode,
    pub username: String,
    pub storage: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            base_url: "http://192.168.11.5".into(),
            auth_mode: AuthMode::Digest,
            username: "maker".into(),
            storage: "usb".into(),
        }
    }
}
impl Settings {
    fn checked(mut self) -> Result<Self> {
        let raw = self.base_url.trim();
        let raw = if raw.contains("://") {
            raw.to_string()
        } else {
            format!("http://{raw}")
        };
        let mut url = reqwest::Url::parse(&raw)
            .map_err(|_| error("settings", "Enter a valid printer IP address or URL."))?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || !matches!(url.path(), "" | "/")
        {
            return Err(error(
                "settings",
                "Use an HTTP(S) printer address without a path or embedded credentials.",
            ));
        }
        url.set_path("");
        self.base_url = url.as_str().trim_end_matches('/').to_string();
        self.username = self.username.trim().to_string();
        self.storage = self.storage.trim().trim_matches('/').to_string();
        if self.storage.is_empty()
            || self.storage.len() > 40
            || !self
                .storage
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
            || self.username.len() > 128
            || self.username.chars().any(char::is_control)
            || self.auth_mode == AuthMode::Digest && self.username.is_empty()
        {
            return Err(error(
                "settings",
                "Enter a valid storage and authentication username.",
            ));
        }
        Ok(self)
    }
    fn account(&self) -> String {
        format!(
            "{}|{}|{}",
            self.base_url,
            if self.auth_mode == AuthMode::ApiKey {
                "key"
            } else {
                "digest"
            },
            self.username
        )
    }
}
trait Vault {
    fn get(&self, s: &Settings) -> Result<Option<String>>;
    fn set(&self, s: &Settings, value: &str) -> Result<()>;
}
struct Keychain;
impl Keychain {
    fn entry(s: &Settings) -> Result<keyring::Entry> {
        keyring::Entry::new(SERVICE, &s.account()).map_err(|_| {
            error(
                "credentials_store",
                "Unable to access the system credential store.",
            )
        })
    }
}
impl Vault for Keychain {
    fn get(&self, s: &Settings) -> Result<Option<String>> {
        match Self::entry(s)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(error(
                "credentials_store",
                "Unable to read printer credentials from the system credential store.",
            )),
        }
    }
    fn set(&self, s: &Settings, value: &str) -> Result<()> {
        Self::entry(s)?.set_password(value).map_err(|_| {
            error(
                "credentials_store",
                "Unable to save printer credentials to the system credential store.",
            )
        })
    }
}
fn save_file(path: &Path, s: &Settings) -> Result<()> {
    std::fs::create_dir_all(path.parent().ok_or_else(settings_error)?)
        .map_err(|_| settings_error())?;
    let temp = path.with_extension(format!("{}.tmp", std::process::id()));
    let result = (|| {
        use std::io::Write;
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|_| settings_error())?;
        file.write_all(&serde_json::to_vec(s).map_err(|_| settings_error())?)
            .map_err(|_| settings_error())?;
        file.sync_all().map_err(|_| settings_error())?;
        std::fs::rename(&temp, path).map_err(|_| settings_error())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temp);
    }
    result
}
fn load(path: &Path, legacy: &Path, vault: &dyn Vault) -> Result<Settings> {
    if path.exists() {
        return serde_json::from_slice::<Settings>(
            &std::fs::read(path).map_err(|_| settings_error())?,
        )
        .map_err(|_| settings_error())?
        .checked();
    }
    let mut s = Settings::default();
    if legacy.exists() {
        let raw: Value =
            serde_json::from_slice(&std::fs::read(legacy).map_err(|_| settings_error())?)
                .map_err(|_| settings_error())?;
        if let Some(p) = raw.get("prusalink") {
            if let Some(url) = p["baseUrl"].as_str() {
                s.base_url = url.into()
            }
            if let Some(storage) = p["storage"].as_str() {
                s.storage = storage.into()
            }
            if let Some(key) = p["apiKey"]
                .as_str()
                .filter(|k| !k.is_empty() && !k.starts_with("PASTE_"))
            {
                s.auth_mode = AuthMode::ApiKey;
                s = s.checked()?;
                vault.set(&s, key)?;
            }
        }
    }
    s = s.checked()?;
    save_file(path, &s)?;
    Ok(s)
}
fn paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf)> {
    let config = app
        .path()
        .app_config_dir()
        .map_err(|_| settings_error())?
        .join("printer-connection.json");
    let legacy = Path::new(env!("CARGO_MANIFEST_DIR")).join("../local-config.json");
    Ok((config, legacy))
}
fn saved(app: &tauri::AppHandle) -> Result<Settings> {
    let _lock = SETTINGS_LOCK.lock().map_err(|_| settings_error())?;
    let (p, l) = paths(app)?;
    load(&p, &l, &Keychain)
}
fn public(s: &Settings, vault: &dyn Vault) -> Result<Value> {
    Ok(
        json!({"baseUrl":s.base_url,"authMode":s.auth_mode,"username":s.username,"storage":s.storage,"hasCredentials":vault.get(s)?.is_some_and(|v|!v.is_empty())}),
    )
}
fn secret_for(s: &Settings, secret: Option<String>, vault: &dyn Vault) -> Result<String> {
    let secret = match secret {
        Some(v) => Some(v),
        None => vault.get(s)?,
    };
    secret
        .filter(|v| {
            !v.is_empty() && v.len() <= 4096 && !v.chars().any(|c| matches!(c, '\r' | '\n'))
        })
        .ok_or_else(|| {
            error(
                "credentials_missing",
                "Enter your PrusaLink authentication details in Settings → Printer Connection.",
            )
        })
}

#[tauri::command]
pub async fn printer_connection_get(app: tauri::AppHandle) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || public(&saved(&app)?, &Keychain))
        .await
        .map_err(|_| settings_error())?
}
#[tauri::command]
pub async fn printer_connection_save(
    app: tauri::AppHandle,
    settings: Settings,
    secret: Option<String>,
) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = SETTINGS_LOCK.lock().map_err(|_| settings_error())?;
        let s = settings.checked()?;
        let (p, _) = paths(&app)?;
        if let Some(value) = secret {
            let value = secret_for(&s, Some(value), &Keychain)?;
            Keychain.set(&s, &value)?;
        }
        save_file(&p, &s)?;
        public(&s, &Keychain)
    })
    .await
    .map_err(|_| settings_error())?
}
struct Session {
    client: Client,
    settings: Settings,
    secret: String,
    prompt: Option<digest_auth::WwwAuthenticateHeader>,
}
fn transport(e: reqwest::Error, upload: bool) -> PrinterError {
    if upload {
        error("upload_uncertain","The transfer was interrupted. Check the printer before sending again; it may have received the file.")
    } else if e.is_timeout() {
        error(
            "timeout",
            "The printer did not respond. Check its IP address and network connection.",
        )
    } else {
        error(
            "unreachable",
            "Unable to reach the printer. Check its IP address and network connection.",
        )
    }
}
fn http_error(status: StatusCode) -> PrinterError {
    match status.as_u16(){
    401|403=>error("auth","PrusaLink rejected the authentication details."),
    404=>error("not_found","The requested printer storage or API endpoint was not found."),
    409=>error("conflict","The filename already exists, the printer is busy, or another transfer is active. Choose a different name or check the printer."),
    400|415|422=>error("filename","The printer rejected the filename or file format. Try a short .gcode filename."),
    507=>error("storage_full","The printer storage is full."),
    _=>error("printer_error",format!("PrusaLink returned HTTP {}.",status.as_u16()))
}
}
impl Session {
    fn new(settings: Settings, secret: String) -> Result<Self> {
        Ok(Self {
            client: Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(4))
                .build()
                .map_err(|_| error("client", "Unable to initialize printer networking."))?,
            settings,
            secret,
            prompt: None,
        })
    }
    fn authorization(
        &mut self,
        method: &Method,
        path: &str,
        body: Option<&[u8]>,
    ) -> Result<Option<String>> {
        if let Some(prompt) = self.prompt.as_mut() {
            let context = digest_auth::AuthContext::new_with_method(
                &self.settings.username,
                &self.secret,
                path,
                body,
                digest_auth::HttpMethod::from(method.as_str()),
            );
            return Ok(Some(
                prompt
                    .respond(&context)
                    .map_err(|_| {
                        error(
                            "auth",
                            "Unsupported PrusaLink Digest authentication challenge.",
                        )
                    })?
                    .to_string(),
            ));
        }
        Ok(None)
    }
    async fn get(&mut self, path: &str) -> Result<Value> {
        for attempt in 0..2 {
            let auth = self.authorization(&Method::GET, path, None)?;
            let mut request = self
                .client
                .get(format!("{}{path}", self.settings.base_url))
                .timeout(Duration::from_secs(8))
                .header("Accept", "application/json");
            if self.settings.auth_mode == AuthMode::ApiKey {
                request = request.header("X-Api-Key", &self.secret)
            } else if let Some(auth) = auth {
                request = request.header("Authorization", auth)
            }
            let response = request.send().await.map_err(|e| transport(e, false))?;
            if response.status() == StatusCode::UNAUTHORIZED
                && attempt == 0
                && self.settings.auth_mode == AuthMode::Digest
            {
                let challenge = response
                    .headers()
                    .get_all("www-authenticate")
                    .iter()
                    .filter_map(|v| v.to_str().ok())
                    .find(|v| v.to_ascii_lowercase().starts_with("digest "))
                    .ok_or_else(|| http_error(StatusCode::UNAUTHORIZED))?;
                self.prompt = Some(digest_auth::parse(challenge).map_err(|_| {
                    error("auth", "Unsupported PrusaLink authentication challenge.")
                })?);
                continue;
            }
            if !response.status().is_success() {
                return Err(http_error(response.status()));
            }
            return response
                .json()
                .await
                .map_err(|_| error("printer_error", "PrusaLink returned an invalid response."));
        }
        Err(http_error(StatusCode::UNAUTHORIZED))
    }
    async fn check(&mut self) -> Result<Value> {
        let status = self.get("/api/v1/status").await?;
        let storages = self.get("/api/v1/storage").await?;
        let list = storages["storage_list"].as_array().ok_or_else(|| {
            error(
                "printer_error",
                "PrusaLink returned an invalid storage list.",
            )
        })?;
        let storage=list.iter().find(|s|s["path"].as_str().is_some_and(|p|p.trim_matches('/')==self.settings.storage)).ok_or_else(||error("storage_unavailable","The configured storage is not present. Insert the USB drive or change Storage in Settings."))?;
        if storage["available"].as_bool() == Some(false) {
            return Err(error(
                "storage_unavailable",
                "The printer storage is unavailable. Check the USB drive.",
            ));
        }
        if storage["read_only"].as_bool() == Some(true) {
            return Err(error("read_only", "The printer storage is read-only."));
        }
        Ok(
            json!({"state":status["printer"]["state"].as_str().unwrap_or("Unknown"),"storages":list,"storage":self.settings.storage}),
        )
    }
    async fn upload(
        &mut self,
        filename: &str,
        content: String,
        print_after: bool,
        progress: Arc<dyn Fn(u64, u64) + Send + Sync>,
    ) -> Result<Value> {
        let filename = filename.trim();
        if filename.is_empty()
            || filename.len() > 240
            || filename.chars().any(|c| {
                c.is_control() || matches!(c, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*')
            })
            || !filename.to_ascii_lowercase().ends_with(".gcode")
            || filename == ".gcode"
        {
            return Err(error(
                "filename",
                "Enter a .gcode filename without folders or reserved characters.",
            ));
        }
        if content.trim().is_empty() || content.len() > 100 * 1024 * 1024 {
            return Err(error(
                "content",
                "G-code must be nonempty and no larger than 100 MB.",
            ));
        }
        let check = self.check().await?;
        if print_after
            && matches!(
                check["state"].as_str(),
                Some("PRINTING" | "PAUSED" | "BUSY" | "ATTENTION" | "ERROR")
            )
        {
            return Err(error(
                "busy",
                "The printer is not ready to start a new print.",
            ));
        }
        let mut url = reqwest::Url::parse(&self.settings.base_url).map_err(|_| settings_error())?;
        url.path_segments_mut()
            .map_err(|_| settings_error())?
            .extend(["api", "v1", "files", &self.settings.storage, filename]);
        let path = url.path().to_string();
        let bytes = Arc::new(content.into_bytes());
        let total = bytes.len() as u64;
        let auth = self.authorization(&Method::PUT, &path, Some(bytes.as_slice()))?;
        let stream = futures_util::stream::unfold(
            (bytes, 0usize, progress),
            |(bytes, pos, progress)| async move {
                if pos >= bytes.len() {
                    None
                } else {
                    let end = (pos + 65536).min(bytes.len());
                    let chunk = bytes[pos..end].to_vec();
                    progress(end as u64, bytes.len() as u64);
                    Some((Ok::<_, std::io::Error>(chunk), (bytes, end, progress)))
                }
            },
        );
        let mut request = self
            .client
            .put(url)
            .timeout(Duration::from_secs(120))
            .header("Content-Type", "application/octet-stream")
            .header("Content-Length", total)
            .header("Print-After-Upload", if print_after { "?1" } else { "?0" })
            .header("Overwrite", "?0");
        if self.settings.auth_mode == AuthMode::ApiKey {
            request = request.header("X-Api-Key", &self.secret)
        } else if let Some(auth) = auth {
            request = request.header("Authorization", auth)
        }
        let response = request
            .body(reqwest::Body::wrap_stream(stream))
            .send()
            .await
            .map_err(|e| transport(e, true))?;
        if !response.status().is_success() {
            return Err(http_error(response.status()));
        }
        Ok(json!({"filename":filename,"printAfterUpload":print_after}))
    }
}
async fn connection(
    app: tauri::AppHandle,
    settings: Option<Settings>,
    secret: Option<String>,
) -> Result<Session> {
    let (s, key) = tauri::async_runtime::spawn_blocking(move || {
        let s = match settings {
            Some(s) => s.checked()?,
            None => saved(&app)?,
        };
        let key = secret_for(&s, secret, &Keychain)?;
        Ok((s, key))
    })
    .await
    .map_err(|_| settings_error())??;
    Session::new(s, key)
}
#[tauri::command]
pub async fn printer_connection_test(
    app: tauri::AppHandle,
    settings: Option<Settings>,
    secret: Option<String>,
) -> Result<Value> {
    connection(app, settings, secret).await?.check().await
}
struct UploadGuard;
impl Drop for UploadGuard {
    fn drop(&mut self) {
        UPLOADING.store(false, Ordering::Release);
    }
}
#[tauri::command]
pub async fn printer_upload_gcode(
    app: tauri::AppHandle,
    filename: String,
    content: String,
    print_after_upload: bool,
    upload_id: String,
) -> Result<Value> {
    if UPLOADING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err(error("busy", "Another printer transfer is in progress."));
    }
    let _guard = UploadGuard;
    if upload_id.len() > 80 || upload_id.is_empty() {
        return Err(error("upload_id", "Invalid transfer ID."));
    }
    let mut session = connection(app.clone(), None, None).await?;
    let progress = Arc::new(move |sent, total| {
        let _ = app.emit(
            "printer-upload-progress",
            json!({"uploadId":upload_id,"sent":sent,"total":total}),
        );
    });
    session
        .upload(&filename, content, print_after_upload, progress)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::HashMap,
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
    };
    #[derive(Clone)]
    struct Request {
        method: String,
        path: String,
        headers: HashMap<String, String>,
        body: Vec<u8>,
    }
    fn mock(
        n: usize,
        handler: impl Fn(usize, &Request) -> (u16, String, String) + Send + 'static,
    ) -> (String, mpsc::Receiver<Request>, thread::JoinHandle<()>) {
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", server.local_addr().unwrap());
        let (tx, rx) = mpsc::channel();
        let handle = thread::spawn(move || {
            for i in 0..n {
                let (mut socket, _) = server.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut data = vec![];
                let header_end = loop {
                    let mut buf = [0; 8192];
                    let n = socket.read(&mut buf).unwrap();
                    assert!(n > 0);
                    data.extend_from_slice(&buf[..n]);
                    if let Some(p) = data.windows(4).position(|s| s == b"\r\n\r\n") {
                        break p + 4;
                    }
                };
                let text = String::from_utf8(data[..header_end].to_vec()).unwrap();
                let mut lines = text.lines();
                let first = lines.next().unwrap().split_whitespace().collect::<Vec<_>>();
                let headers = lines
                    .filter_map(|l| l.split_once(':'))
                    .map(|(k, v)| (k.to_lowercase(), v.trim().to_string()))
                    .collect::<HashMap<_, _>>();
                let length = headers
                    .get("content-length")
                    .and_then(|s| s.parse::<usize>().ok())
                    .unwrap_or(0);
                while data.len() < header_end + length {
                    let mut buf = [0; 8192];
                    let n = socket.read(&mut buf).unwrap();
                    assert!(n > 0);
                    data.extend_from_slice(&buf[..n])
                }
                let request = Request {
                    method: first[0].into(),
                    path: first[1].into(),
                    headers,
                    body: data[header_end..header_end + length].to_vec(),
                };
                let (status, extra, body) = handler(i, &request);
                let _ = tx.send(request);
                if status == 0 {
                    continue;
                }
                write!(socket,"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n{body}",body.len()).unwrap();
            }
        });
        (address, rx, handle)
    }
    fn rt<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(f)
    }
    fn status() -> String {
        r#"{"printer":{"state":"IDLE"}}"#.into()
    }
    fn storage() -> String {
        r#"{"storage_list":[{"path":"/usb/","type":"USB","available":true,"read_only":false}]}"#
            .into()
    }
    fn session(url: String, mode: AuthMode) -> Session {
        Session::new(
            Settings {
                base_url: url,
                auth_mode: mode,
                ..Settings::default()
            },
            "test-secret".into(),
        )
        .unwrap()
    }
    #[test]
    fn key_upload_preserves_bytes_and_does_not_start_or_overwrite() {
        let (url, rx, server) = mock(3, |i, r| {
            assert_eq!(r.headers.get("x-api-key").unwrap(), "test-secret");
            (
                if i == 2 { 201 } else { 200 },
                String::new(),
                match i {
                    0 => status(),
                    1 => storage(),
                    _ => String::new(),
                },
            )
        });
        let content = "; thumbnail begin\nG1 X1 Y2 E3\nM601\n";
        let progress = Arc::new(Mutex::new(Vec::new()));
        let log = progress.clone();
        let result = rt(session(url, AuthMode::ApiKey).upload(
            "test part.gcode",
            content.into(),
            false,
            Arc::new(move |s, t| log.lock().unwrap().push((s, t))),
        ))
        .unwrap();
        server.join().unwrap();
        let requests = rx.into_iter().collect::<Vec<_>>();
        let put = &requests[2];
        assert_eq!(put.method, "PUT");
        assert_eq!(put.path, "/api/v1/files/usb/test%20part.gcode");
        assert_eq!(put.headers["print-after-upload"], "?0");
        assert_eq!(put.headers["overwrite"], "?0");
        assert_eq!(put.body, content.as_bytes());
        assert_eq!(result["printAfterUpload"], false);
        assert_eq!(
            progress.lock().unwrap().last(),
            Some(&(content.len() as u64, content.len() as u64))
        );
    }
    #[test]
    fn digest_signs_each_method_and_print_choice_is_explicit() {
        let (url, rx, server) = mock(4, |i, r| {
            if i == 0 {
                assert!(!r.headers.contains_key("authorization"));
                return(401,"WWW-Authenticate: Digest realm=\"Prusa\", nonce=\"nonce\", qop=\"auth\", algorithm=MD5\r\n".into(),String::new());
            }
            let header = &r.headers["authorization"];
            let mut answer = digest_auth::AuthorizationHeader::parse(header).unwrap();
            let received = answer.response.clone();
            let context = digest_auth::AuthContext::new_with_method(
                "maker",
                "test-secret",
                &r.path,
                Some(r.body.as_slice()),
                digest_auth::HttpMethod::from(r.method.as_str()),
            );
            answer.digest(&context);
            assert_eq!(answer.response, received);
            assert_eq!(answer.nc, i as u32);
            (
                if i == 3 { 201 } else { 200 },
                String::new(),
                match i {
                    1 => status(),
                    2 => storage(),
                    _ => String::new(),
                },
            )
        });
        rt(session(url, AuthMode::Digest).upload(
            "part.gcode",
            "G28\n".into(),
            true,
            Arc::new(|_, _| {}),
        ))
        .unwrap();
        server.join().unwrap();
        let r = rx.into_iter().last().unwrap();
        assert_eq!(r.headers["print-after-upload"], "?1");
    }
    #[test]
    fn authentication_failure_is_not_retried_forever() {
        let (url, _, server) = mock(1, |_, _| (401, String::new(), String::new()));
        assert_eq!(
            rt(session(url, AuthMode::ApiKey).check()).unwrap_err().code,
            "auth"
        );
        server.join().unwrap();
    }
    #[test]
    fn missing_and_readonly_storage_prevent_upload() {
        for (readonly, expected) in [(true, "read_only"), (false, "storage_unavailable")] {
            let (url, _, server) = mock(2, move |i, _| {
                (
                    200,
                    String::new(),
                    if i == 0 {
                        status()
                    } else if readonly {
                        storage().replace("\"read_only\":false", "\"read_only\":true")
                    } else {
                        r#"{"storage_list":[]}"#.into()
                    },
                )
            });
            assert_eq!(
                rt(session(url, AuthMode::ApiKey).upload(
                    "p.gcode",
                    "G28".into(),
                    false,
                    Arc::new(|_, _| {})
                ))
                .unwrap_err()
                .code,
                expected
            );
            server.join().unwrap();
        }
    }
    #[test]
    fn busy_printer_cannot_be_started() {
        let (url, _, server) = mock(2, |i, _| {
            (
                200,
                String::new(),
                if i == 0 {
                    status().replace("IDLE", "PRINTING")
                } else {
                    storage()
                },
            )
        });
        assert_eq!(
            rt(session(url, AuthMode::ApiKey).upload(
                "p.gcode",
                "G28".into(),
                true,
                Arc::new(|_, _| {})
            ))
            .unwrap_err()
            .code,
            "busy"
        );
        server.join().unwrap();
    }
    #[test]
    fn conflict_and_interrupted_upload_are_not_retried() {
        for (code, expected) in [(409, "conflict"), (0, "upload_uncertain")] {
            let (url, _, server) = mock(3, move |i, _| {
                (
                    if i == 2 { code } else { 200 },
                    String::new(),
                    match i {
                        0 => status(),
                        1 => storage(),
                        _ => String::new(),
                    },
                )
            });
            assert_eq!(
                rt(session(url, AuthMode::ApiKey).upload(
                    "p.gcode",
                    "G28".into(),
                    false,
                    Arc::new(|_, _| {})
                ))
                .unwrap_err()
                .code,
                expected
            );
            server.join().unwrap();
        }
    }
    #[test]
    fn invalid_settings_and_filenames_rejected_without_network() {
        for address in [
            "file:///tmp/file",
            "http://user:pass@localhost",
            "http://localhost/api",
            "http://localhost?key=x",
        ] {
            assert!(Settings {
                base_url: address.into(),
                ..Settings::default()
            }
            .checked()
            .is_err())
        }
        for filename in ["../part.gcode", "bad\n.gcode", "file.txt", ".gcode"] {
            assert_eq!(
                rt(
                    session("http://127.0.0.1:1".into(), AuthMode::ApiKey).upload(
                        filename,
                        "G28".into(),
                        false,
                        Arc::new(|_, _| {})
                    )
                )
                .unwrap_err()
                .code,
                "filename"
            )
        }
    }
    struct MemoryVault(Mutex<HashMap<String, String>>);
    impl Vault for MemoryVault {
        fn get(&self, s: &Settings) -> Result<Option<String>> {
            Ok(self.0.lock().unwrap().get(&s.account()).cloned())
        }
        fn set(&self, s: &Settings, v: &str) -> Result<()> {
            self.0.lock().unwrap().insert(s.account(), v.into());
            Ok(())
        }
    }
    #[test]
    fn migration_persists_settings_without_credentials_and_host_changes_do_not_reuse_them() {
        let root = std::env::temp_dir().join(format!("pathloom-printer-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("connection.json");
        let legacy = root.join("local-config.json");
        std::fs::write(&legacy,r#"{"prusalink":{"baseUrl":"http://192.168.11.5","apiKey":"test-secret","storage":"usb"}}"#).unwrap();
        let vault = MemoryVault(Mutex::new(HashMap::new()));
        let s = load(&path, &legacy, &vault).unwrap();
        assert_eq!(s.auth_mode, AuthMode::ApiKey);
        assert_eq!(public(&s, &vault).unwrap()["hasCredentials"], true);
        assert!(!std::fs::read_to_string(&path)
            .unwrap()
            .contains("test-secret"));
        assert!(!public(&s, &vault)
            .unwrap()
            .to_string()
            .contains("test-secret"));
        assert_eq!(secret_for(&s, None, &vault).unwrap(), "test-secret");
        assert_eq!(
            secret_for(
                &Settings {
                    base_url: "http://192.168.11.6".into(),
                    ..s.clone()
                },
                None,
                &vault
            )
            .unwrap_err()
            .code,
            "credentials_missing"
        );
        std::fs::remove_file(legacy).unwrap();
        assert_eq!(
            load(&path, &root.join("absent"), &vault).unwrap().base_url,
            s.base_url
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
