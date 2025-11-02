use tauri::Emitter;
use tauri_plugin_dialog::FileDialogBuilder;
use tokio::{
    net::{TcpListener, TcpStream},
    io::{AsyncReadExt, AsyncWriteExt},
};
use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use uuid::Uuid;
use log::{info, error, warn};
use tokio::fs;
use tokio::time::{timeout, Duration};
use std::time::Instant;
use tauri_plugin_dialog::DialogExt;
use std::collections::HashMap;
use once_cell::sync::Lazy;
use tokio::sync::Mutex as TokioMutex;
use sysinfo::System;

// Global shared state for transfer responses
static TRANSFER_RESPONSES: Lazy<TokioMutex<HashMap<String, bool>>> = Lazy::new(|| TokioMutex::new(HashMap::new()));

// Batch responses: batch_id -> (accept, Option<PathBuf>)
static BATCH_RESPONSES: Lazy<TokioMutex<HashMap<String, (bool, Option<PathBuf>)>>> =
    Lazy::new(|| TokioMutex::new(HashMap::new()));

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RespondTransferArgs {
    #[serde(alias = "transfer_id")]
    pub transfer_id: String,
    pub accept: bool,
    #[serde(default)]
    pub trust: Option<bool>,
}

// Map transfer_id -> ip for later trust decisions
static TRANSFER_IPS: Lazy<TokioMutex<HashMap<String, String>>> = Lazy::new(|| TokioMutex::new(HashMap::new()));

#[tauri::command]
pub async fn respond_transfer(args: RespondTransferArgs) {
    // store user accept/deny decision
    {
        let mut map = TRANSFER_RESPONSES.lock().await;
        map.insert(args.transfer_id.clone(), args.accept);
    }
    // if user opted to trust, persist sender ip
    if args.accept {
        if let Some(true) = args.trust {
            if let Some(ip) = {
                let map = TRANSFER_IPS.lock().await;
                map.get(&args.transfer_id).cloned()
            } {
                let _ = add_trusted_device_ip(&ip).await;
            }
        }
    }
}
use dirs;
use tauri::AppHandle;

// --- Settings and Trusted Devices Persistence ---
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AppSettings {
    #[serde(default)]
    auto_accept_trusted: bool,
}

async fn app_data_dir() -> anyhow::Result<PathBuf> {
    let mut dir = dirs::data_dir().ok_or_else(|| anyhow::anyhow!("impossibile ottenere data_dir"))?;
    dir.push("AirShare");
    if !dir.exists() {
        tokio::fs::create_dir_all(&dir).await?;
    }
    Ok(dir)
}

async fn settings_path() -> anyhow::Result<PathBuf> { Ok(app_data_dir().await?.join("settings.json")) }
async fn trusted_devices_path() -> anyhow::Result<PathBuf> { Ok(app_data_dir().await?.join("trusted_devices.json")) }

async fn read_settings() -> AppSettings {
    match settings_path().await.and_then(|p| Ok(p)) {
        Ok(p) => match tokio::fs::read(&p).await {
            Ok(bytes) if !bytes.is_empty() => serde_json::from_slice(&bytes).unwrap_or_default(),
            _ => AppSettings::default(),
        },
        Err(_) => AppSettings::default(),
    }
}

async fn write_settings(s: &AppSettings) -> anyhow::Result<()> {
    let p = settings_path().await?;
    let tmp = p.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(s)?;
    tokio::fs::write(&tmp, &bytes).await?;
    tokio::fs::rename(&tmp, &p).await?;
    Ok(())
}

async fn read_trusted_ips() -> Vec<String> {
    match trusted_devices_path().await.and_then(|p| Ok(p)) {
        Ok(p) => match tokio::fs::read(&p).await {
            Ok(bytes) if !bytes.is_empty() => serde_json::from_slice(&bytes).unwrap_or_else(|_| Vec::new()),
            _ => Vec::new(),
        },
        Err(_) => Vec::new(),
    }
}

async fn write_trusted_ips(list: &Vec<String>) -> anyhow::Result<()> {
    let p = trusted_devices_path().await?;
    let tmp = p.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(list)?;
    tokio::fs::write(&tmp, &bytes).await?;
    tokio::fs::rename(&tmp, &p).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_auto_accept_trusted() -> Result<bool, String> {
    Ok(read_settings().await.auto_accept_trusted)
}

#[tauri::command]
pub async fn set_auto_accept_trusted(value: bool) -> Result<(), String> {
    let mut s = read_settings().await;
    s.auto_accept_trusted = value;
    write_settings(&s).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_trusted_devices() -> Result<Vec<String>, String> {
    Ok(read_trusted_ips().await)
}

pub async fn add_trusted_device_ip(ip: &str) -> Result<(), String> {
    let mut list = read_trusted_ips().await;
    if !list.iter().any(|x| x == ip) {
        list.push(ip.to_string());
        write_trusted_ips(&list).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn remove_trusted_device_ip(ip: String) -> Result<(), String> {
    let mut list = read_trusted_ips().await;
    list.retain(|x| x != &ip);
    write_trusted_ips(&list).await.map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOffer {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub mime: String,
    pub sha256: Option<String>,
    // Optionally, batch_id for batch transfers
    #[serde(default)]
    pub batch_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub size: u64,
    pub name: String,
    pub is_file: bool,
}

/// Calcola l'ETA basandosi sulla velocità di trasferimento attuale
fn calculate_eta(bytes_transferred: u64, total_bytes: u64, elapsed_ms: u128) -> (u128, String) {
    if bytes_transferred == 0 || elapsed_ms == 0 {
        return (0, "Calcolo ETA...".to_string());
    }
    
    let bytes_remaining = total_bytes - bytes_transferred;
    let bytes_per_ms = bytes_transferred as f64 / elapsed_ms as f64;
    
    if bytes_per_ms <= 0.0 {
        return (0, "Calcolo ETA...".to_string());
    }
    
    let eta_ms = (bytes_remaining as f64 / bytes_per_ms) as u128;
    
    // Formatta l'ETA in formato leggibile
    let eta_formatted = if eta_ms < 1000 {
        format!("{}ms rimanenti", eta_ms)
    } else if eta_ms < 60000 {
        format!("{:.0}s rimanenti", eta_ms as f64 / 1000.0)
    } else if eta_ms < 3600000 {
        let minutes = eta_ms / 60000;
        let seconds = (eta_ms % 60000) / 1000;
        format!("{}m {}s rimanenti", minutes, seconds)
    } else {
        let hours = eta_ms / 3600000;
        let minutes = (eta_ms % 3600000) / 60000;
        format!("{}h {}m rimanenti", hours, minutes)
    };
    
    (eta_ms, eta_formatted)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferType {
    Sent,
    Received,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferStatus {
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceType {
    Desktop,
    Mobile,
    Tablet,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferRecord {
    pub id: String,
    pub file_name: String,
    pub file_size: u64,
    #[serde(rename = "type")]
    pub transfer_type: TransferType,
    pub status: TransferStatus,
    pub from_device: String,
    pub to_device: String,
    pub start_time: String,
    pub duration: u64,
    pub speed: f64,
    pub device_type: DeviceType,
}

static RECENTS_LOCK: Lazy<TokioMutex<()>> = Lazy::new(|| TokioMutex::new(()));

async fn save_recent_transfer(_app_handle: &AppHandle, record: &TransferRecord) -> anyhow::Result<()> {
    let _guard = RECENTS_LOCK.lock().await;
    // Usa dirs::data_dir come base e crea una sottocartella per l'app
    let mut dir = dirs::data_dir().ok_or_else(|| anyhow::anyhow!("impossibile ottenere data_dir"))?;
    dir.push("AirShare");
    // AGGIUNGI QUESTO LOG
    info!("📁 Recent transfers path: {:?}", dir.join("recent_transfers.json"));
    if !dir.exists() {
        tokio::fs::create_dir_all(&dir).await?;
    }
    let file_path = dir.join("recent_transfers.json");

    // Leggi JSON esistente (array) oppure crea nuovo
    let existing: Vec<TransferRecord> = match tokio::fs::read(&file_path).await {
        Ok(bytes) => {
            if bytes.is_empty() {
                Vec::new()
            } else {
                match serde_json::from_slice::<Vec<TransferRecord>>(&bytes) {
                    Ok(v) => v,
                    Err(_) => Vec::new(),
                }
            }
        }
        Err(_) => Vec::new(),
    };

    let mut updated = existing;
    updated.insert(0, record.clone());
    // Mantieni solo gli ultimi 100 record per evitare crescita infinita
    if updated.len() > 100 {
        updated.truncate(100);
    }

    let json = serde_json::to_vec_pretty(&updated)?;
    // Usa write atomico best-effort
    let tmp_path = file_path.with_extension("json.tmp");
    tokio::fs::write(&tmp_path, &json).await?;
    tokio::fs::rename(&tmp_path, &file_path).await?;
    Ok(())
}

#[tauri::command]
pub async fn add_recent_transfer(
    app_handle: tauri::AppHandle,
    file_name: String,
    file_size: u64,
    transfer_type: TransferType,
    _target_ip: String,
    target_name: String,
    elapsed_ms: u128,
    status: TransferStatus,
) -> Result<(), String> {
    // Calcola velocità in MB/s
    let duration_secs = (elapsed_ms as f64) / 1000.0;
    let speed_mbps = if duration_secs > 0.0 {
        (file_size as f64 / 1024.0 / 1024.0) / duration_secs
    } else {
        0.0
    };

    // Nome dispositivo locale
    let local_device = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "Unknown Device".to_string());

    let (from_device, to_device) = match transfer_type {
        TransferType::Sent => (local_device, target_name.clone()),
        TransferType::Received => (target_name.clone(), local_device),
    };

    let record = TransferRecord {
        id: uuid::Uuid::new_v4().to_string(),
        file_name,
        file_size,
        transfer_type,
        status,
        from_device,
        to_device,
        start_time: chrono::Utc::now().to_rfc3339(),
        duration: (elapsed_ms / 1000) as u64,
        speed: speed_mbps,
        device_type: DeviceType::Desktop,
    };

    save_recent_transfer(&app_handle, &record)
        .await
        .map_err(|e| format!("failed to save recent transfer: {}", e))
}

#[tauri::command]
pub async fn get_recent_transfers() -> Result<Vec<TransferRecord>, String> {
    let mut dir = dirs::data_dir()
        .ok_or_else(|| "impossibile ottenere data_dir".to_string())?;
    dir.push("AirShare");
    dir.push("recent_transfers.json");
    match tokio::fs::read(&dir).await {
        Ok(bytes) if !bytes.is_empty() => {
            serde_json::from_slice::<Vec<TransferRecord>>(&bytes)
                .map_err(|e| format!("Failed to parse transfers: {}", e))
        }
        Ok(_) => Ok(Vec::new()),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

async fn delete_transfer_by_id(transfer_id: &str) -> anyhow::Result<()> {
    let _guard = RECENTS_LOCK.lock().await;
    let mut dir = dirs::data_dir()
        .ok_or_else(|| anyhow::anyhow!("impossibile ottenere data_dir"))?;
    dir.push("AirShare");
    
    if !dir.exists() {
        return Ok(());
    }
    
    let file_path = dir.join("recent_transfers.json");
    
    let existing: Vec<TransferRecord> = match tokio::fs::read(&file_path).await {
        Ok(bytes) if !bytes.is_empty() => {
            match serde_json::from_slice::<Vec<TransferRecord>>(&bytes) {
                Ok(v) => v,
                Err(_) => Vec::new(),
            }
        }
        _ => Vec::new(),
    };
    
    let updated: Vec<TransferRecord> = existing.into_iter()
        .filter(|t| t.id != transfer_id)
        .collect();
    
    let json = serde_json::to_vec_pretty(&updated)?;
    let tmp_path = file_path.with_extension("json.tmp");
    tokio::fs::write(&tmp_path, &json).await?;
    tokio::fs::rename(&tmp_path, &file_path).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_recent_transfer(transfer_id: String) -> Result<(), String> {
    delete_transfer_by_id(&transfer_id)
        .await
        .map_err(|e| format!("failed to delete transfer: {}", e))
}

/// Get file information for a given file path
#[tauri::command]
pub fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    match std::fs::metadata(&file_path) {
        Ok(metadata) => {
            let name = std::path::Path::new(&file_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
                
            Ok(FileInfo {
                size: metadata.len(),
                name,
                is_file: metadata.is_file(),
            })
        }
        Err(e) => Err(format!("Failed to get file info: {}", e)),
    }
}

/// Emit a backend_log event to the frontend with a level and message
pub async fn tauri_log(app_handle: &AppHandle, level: &str, message: impl Into<String>) {
    let payload = serde_json::json!({
        "level": level,
        "message": message.into(),
        "ts": chrono::Utc::now().to_rfc3339(),
    });
    let _ = app_handle.emit("backend_log", payload);
}

/// Start a TCP file server for incoming file transfers.
pub async fn start_file_server(app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    let listener = TcpListener::bind("0.0.0.0:40124").await?;
    info!("File server listening on 0.0.0.0:40124");
    tauri_log(&app_handle, "info", "File server listening on 0.0.0.0:40124").await;
    info!("Entering file server loop");
    
    // Log delle interfacce di rete disponibili per debug
    if let Ok(addrs) = get_if_addrs::get_if_addrs() {
        info!("Available network interfaces:");
        for iface in addrs {
            if !iface.is_loopback() {
                info!("  - {}: {}", iface.name, iface.ip());
            }
        }
    }
    loop {
        let (mut socket, addr) = match listener.accept().await {
            Ok(res) => {
                info!("Accepted new connection from {}", res.1);
                tauri_log(&app_handle, "info", format!("Accepted new connection from {}", res.1)).await;
                res
            },
            Err(e) => {
                error!("Failed to accept connection: {}", e);
                tauri_log(&app_handle, "error", format!("Failed to accept connection: {}", e)).await;
                return Err(e.into());
            }
        };

        if let Err(e) = socket.set_nodelay(true) {
            warn!("Failed to set TCP_NODELAY on {}: {}", addr, e);
            tauri_log(&app_handle, "warn", format!("Failed to set TCP_NODELAY on {}: {}", addr, e)).await;
        }

        let app_handle = app_handle.clone();
        tokio::spawn(async move {
            // Read header JSON until newline
            let mut header_buf = Vec::new();
            info!("({addr}) Waiting for header JSON line (ending with \\n)...");
            loop {
                let mut byte = [0u8; 1];
                if let Err(e) = socket.read_exact(&mut byte).await {
                    error!("({addr}) Failed to read header byte (client closed early?): {}", e);
                    // Could not read header at all -> nothing we can do; no ack to send
                    return;
                }
                if byte[0] == b'\n' {
                    break;
                }
                header_buf.push(byte[0]);
                // Limit header size for safety
                if header_buf.len() > 16 * 1024 {
                    error!("({addr}) Header too large (>16KiB) without newline. Sending negative ack and closing.");
                    let nack = serde_json::json!({ "accept": false, "error": "header too large or missing newline" });
                    let nack_str = serde_json::to_string(&nack).unwrap() + "\n";
                    if let Err(e) = socket.write_all(nack_str.as_bytes()).await {
                        error!("({addr}) Failed to write negative ack: {}", e);
                    } else {
                        let _ = socket.flush().await;
                        info!("({addr}) Negative ack sent for oversized header.");
                    }
                    return;
                }
            }
            info!("({addr}) Read header bytes, length: {}", header_buf.len());
            let header_str = match String::from_utf8(header_buf) {
                Ok(s) => s,
                Err(e) => {
                    error!("({addr}) Invalid header utf8: {}. Sending negative ack.", e);
                    tauri_log(&app_handle, "error", format!("Invalid header utf8 from {}: {}", addr, e)).await;
                    let nack = serde_json::json!({ "accept": false, "error": "invalid utf8 in header" });
                    let nack_str = serde_json::to_string(&nack).unwrap() + "\n";
                    if let Err(w) = socket.write_all(nack_str.as_bytes()).await {
                        error!("({addr}) Failed to write negative ack: {}", w);
                    } else {
                        let _ = socket.flush().await;
                        info!("({addr}) Negative ack sent due to UTF-8 error.");
                    }
                    return;
                }
            };
            info!("({addr}) Received header line: {}", header_str);

            let offer: FileOffer = match serde_json::from_str(&header_str) {
                Ok(o) => o,
                Err(e) => {
                    error!("({addr}) Invalid header JSON: {}. Sending negative ack.", e);
                    tauri_log(&app_handle, "error", format!("Invalid header JSON from {}: {}", addr, e)).await;
                    let nack = serde_json::json!({ "accept": false, "error": "invalid json" });
                    let nack_str = serde_json::to_string(&nack).unwrap() + "\n";
                    if let Err(w) = socket.write_all(nack_str.as_bytes()).await {
                        error!("({addr}) Failed to write negative ack: {}", w);
                    } else {
                        let _ = socket.flush().await;
                        info!("({addr}) Negative ack sent due to JSON parse error.");
                    }
                    return;
                }
            };
            info!(
                "[RECV] Parsed FileOffer | transfer_id={} batch_id={:?} file_name={}",
                offer.transfer_id, offer.batch_id, offer.file_name
            );
            // Emit the full header JSON line to the frontend for debugging
            tauri_log(&app_handle, "debug", format!("[RECV] Full FileOffer JSON: {}", header_str)).await;
            // Determine batch_id (use transfer_id if not present)
            // Determine batch_id (use transfer_id if not present)
let batch_id = offer.batch_id.clone().unwrap_or_else(|| offer.transfer_id.clone());
info!("({addr}) Parsed file offer: {:?}, batch_id: {}", offer, batch_id);
tauri_log(&app_handle, "info", format!("Parsed file offer from {}: {} ({} bytes)", addr, offer.file_name, offer.file_size)).await;

let transfer_id = offer.transfer_id.clone();
// Record transfer -> ip for potential trust saving
{
    let mut tmap = TRANSFER_IPS.lock().await;
    tmap.insert(transfer_id.clone(), addr.ip().to_string());
}

let mut accept: bool;
let mut save_dir: Option<PathBuf>;
let mut is_batch_first = false;

// Check if we already have a batch response
{
    let map = BATCH_RESPONSES.lock().await;
    if let Some((a, d)) = map.get(&batch_id) {
        info!("({addr}) [BATCH] Existing batch_id {} found. Reusing accept/dir for new connection.", batch_id);
        tauri_log(&app_handle, "info", format!("[BATCH] Existing batch_id {} found. Reusing accept/dir for new connection from {}.", batch_id, addr)).await;
        accept = *a;
        save_dir = d.clone();
    } else {
        info!("({addr}) [BATCH] No entry for batch_id {}. Checking auto-accept/trust or asking user.", batch_id);
        tauri_log(&app_handle, "info", format!("[BATCH] No entry for batch_id {}. Checking auto-accept/trust or asking user from {}.", batch_id, addr)).await;
        is_batch_first = true;
        accept = false;
        save_dir = None;
    }
}

if is_batch_first {
    // Check if auto-accept is enabled and IP is trusted
    let ip_str = addr.ip().to_string();
    let auto_enabled = read_settings().await.auto_accept_trusted;
    let trusted = read_trusted_ips().await;
    let should_auto_accept = auto_enabled && trusted.iter().any(|x| x == &ip_str);

    if should_auto_accept {
        info!("({addr}) ✅ Auto-accept enabled for trusted IP: {}", ip_str);
        tauri_log(&app_handle, "info", format!("✅ Auto-accept enabled for trusted IP: {}", ip_str)).await;
        
        accept = true;
        
        // Emit notification event to frontend
        let _ = app_handle.emit(
            "transfer_auto_accepted",
            serde_json::json!({
                "transfer_id": transfer_id,
                "file_name": offer.file_name,
                "file_size": offer.file_size,
                "ip": ip_str,
                "device_name": ip_str.clone(),
            }),
        );
        
        // Ask only for destination folder
        use std::sync::Arc;
        use tokio::sync::Mutex;
        let save_dir_result: Arc<Mutex<Option<PathBuf>>> = Arc::new(Mutex::new(None));
        let save_dir_clone = save_dir_result.clone();
        
        FileDialogBuilder::new(app_handle.dialog().clone())
            .set_title("Scegli la cartella di destinazione per il file dal dispositivo fidato")
            .pick_folder(move |path| {
                let save_dir_clone = save_dir_clone.clone();
                tauri::async_runtime::spawn(async move {
                    let mut result = save_dir_clone.lock().await;
                    *result = path.and_then(|p| p.as_path().map(|path| PathBuf::from(path)));
                });
            });
        
        info!("({addr}) Auto-accept: Waiting for user to select destination folder...");
        tauri_log(&app_handle, "info", format!("Auto-accept: Waiting for destination folder selection for {}", ip_str)).await;
        
        // Wait for folder selection with timeout
        let timeout_duration = tokio::time::Duration::from_secs(300); // 5 minuti timeout
        let start_time = tokio::time::Instant::now();
        
        let chosen_dir = loop {
            if start_time.elapsed() > timeout_duration {
                error!("({addr}) Timeout waiting for folder selection");
                tauri_log(&app_handle, "error", format!("Timeout waiting for folder selection from {}", addr)).await;
                
                // Send rejection
                let nack = serde_json::json!({ "accept": false, "error": "timeout_folder_selection" });
                let nack_str = serde_json::to_string(&nack).unwrap() + "\n";
                let _ = socket.write_all(nack_str.as_bytes()).await;
                let _ = socket.flush().await;
                return;
            }
            
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            let result = save_dir_result.lock().await;
            if result.is_some() {
                break result.clone();
            }
        };
        
        save_dir = chosen_dir;
        
        if save_dir.is_none() {
            info!("({addr}) User cancelled folder selection for auto-accepted transfer");
            tauri_log(&app_handle, "info", format!("User cancelled folder selection for auto-accepted transfer from {}", addr)).await;
            
            // Send rejection
            let nack = serde_json::json!({ "accept": false, "error": "user_cancelled_folder" });
            let nack_str = serde_json::to_string(&nack).unwrap() + "\n";
            if let Err(e) = socket.write_all(nack_str.as_bytes()).await {
                error!("({addr}) Failed to write cancellation ack: {}", e);
            } else {
                let _ = socket.flush().await;
            }
            return;
        }
        
        // Save to BATCH_RESPONSES
        {
            let mut map = BATCH_RESPONSES.lock().await;
            map.insert(batch_id.clone(), (accept, save_dir.clone()));
            info!("({addr}) [BATCH] Saved batch_id {} to BATCH_RESPONSES with accept = true (auto-accept) and save_dir = {:?}", batch_id, save_dir);
            tauri_log(&app_handle, "info", format!("[BATCH] Saved batch_id {} to BATCH_RESPONSES (auto-accept)", batch_id)).await;
        }
    } else {
        // NOT auto-accept: show normal prompt
        info!("({addr}) Auto-accept disabled or IP not trusted. Showing normal prompt.");
        tauri_log(&app_handle, "info", format!("Auto-accept disabled or IP not trusted for {}. Showing prompt.", addr.ip())).await;
        
        // Emit event to frontend (include source address info)
        info!("({addr}) Emitting transfer_request event for batch_id: {}", batch_id);
        tauri_log(&app_handle, "info", format!("Emitting transfer_request for {} from {}", transfer_id, addr)).await;
        let _ = app_handle.emit(
            "transfer_request",
            serde_json::json!({
                "offer": offer,
                "ip": addr.ip().to_string(),
                "port": addr.port(),
                "direction": "receive"
            }),
        );
        info!("({addr}) Waiting for user confirmation for transfer_id: {}", transfer_id);
        tauri_log(&app_handle, "info", format!("Waiting for user confirmation for transfer_id: {}", transfer_id)).await;
        
        // Wait for user response
        accept = loop {
            let map = TRANSFER_RESPONSES.lock().await;
            if let Some(&a) = map.get(&transfer_id) {
                break a;
            }
            drop(map);
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        };
        
        info!("({addr}) User responded with accept = {} for transfer_id: {}", accept, transfer_id);
        tauri_log(&app_handle, "info", format!("User responded with accept = {} for transfer_id: {}", accept, transfer_id)).await;
        
        // Remove transfer_id from TRANSFER_RESPONSES
        {
            let mut map = TRANSFER_RESPONSES.lock().await;
            map.remove(&transfer_id);
        }
        
        // If accepted, ask for folder
        if accept {
            use std::sync::Arc;
            use tokio::sync::Mutex;
            let save_dir_result: Arc<Mutex<Option<PathBuf>>> = Arc::new(Mutex::new(None));
            let save_dir_clone = save_dir_result.clone();
            FileDialogBuilder::new(app_handle.dialog().clone())
                .set_title("Scegli la cartella di destinazione per il file")
                .pick_folder(move |path| {
                    let save_dir_clone = save_dir_clone.clone();
                    tauri::async_runtime::spawn(async move {
                        let mut result = save_dir_clone.lock().await;
                        *result = path.and_then(|p| p.as_path().map(|path| PathBuf::from(path)));
                    });
                });
            info!("({addr}) Waiting for user to select destination folder for batch_id: {}", batch_id);
            tauri_log(&app_handle, "info", format!("Waiting for user to select destination folder for batch_id: {}", batch_id)).await;
            
            let chosen_dir = loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                let result = save_dir_result.lock().await;
                if result.is_some() {
                    break result.clone();
                }
            };
            save_dir = chosen_dir;
            info!("({addr}) User selected destination folder for batch_id: {}: {:?}", batch_id, save_dir);
            tauri_log(&app_handle, "info", format!("User selected destination folder for batch_id: {}: {:?}", batch_id, save_dir)).await;
        }
        
        // Save to BATCH_RESPONSES (even if rejected, to avoid repeated asks)
        {
            let mut map = BATCH_RESPONSES.lock().await;
            map.insert(batch_id.clone(), (accept, save_dir.clone()));
            info!("({addr}) [BATCH] Saved batch_id {} to BATCH_RESPONSES with accept = {} and save_dir = {:?}", batch_id, accept, save_dir);
            tauri_log(&app_handle, "info", format!("[BATCH] Saved batch_id {} to BATCH_RESPONSES with accept = {} and save_dir = {:?}", batch_id, accept, save_dir)).await;
        }
    }
}

// Send ack JSON
let ack = if accept {
    serde_json::json!({ "accept": true })
} else {
    serde_json::json!({ "accept": false, "error": "user_rejected" })
};
            let ack_str = serde_json::to_string(&ack).unwrap() + "\n";
            match socket.write_all(ack_str.as_bytes()).await {
                Ok(_) => {
                    info!("({addr}) Sent ack to client: {}", ack_str.trim_end());
                    tauri_log(&app_handle, "info", format!("Sent ack to {} for transfer {}", addr, transfer_id)).await;
                    if let Err(e) = socket.flush().await {
                        warn!("({addr}) Flush after ack failed: {}", e);
                        tauri_log(&app_handle, "warn", format!("Flush after ack failed for {}: {}", addr, e)).await;
                    }
                }
                Err(e) => {
                    error!("({addr}) Failed to write ack: {}", e);
                    tauri_log(&app_handle, "error", format!("Failed to write ack to {}: {}", addr, e)).await;
                    // On error, cleanup batch entry if we just created it
                    if is_batch_first {
                        let mut map = BATCH_RESPONSES.lock().await;
                        map.remove(&batch_id);
                    }
                    return;
                }
            }
            if !accept {
                info!("({addr}) Transfer rejected by user.");
                // On reject, cleanup batch entry if we just created it
                if is_batch_first {
                    let mut map = BATCH_RESPONSES.lock().await;
                    map.remove(&batch_id);
                }
                return;
            }
            // Retrieve save_dir from batch map (in case not first)
            let actual_save_dir = {
                let map = BATCH_RESPONSES.lock().await;
                map.get(&batch_id).and_then(|(_, dir)| dir.clone())
            };
            let save_dir = match actual_save_dir {
                Some(path) => path,
                None => {
                    info!("({addr}) Trasferimento annullato dall'utente.");
                    let _ = app_handle.emit("transfer_rejected", serde_json::json!({
                        "transfer_id": transfer_id,
                        "reason": "user_cancelled"
                    }));
                    // On cancel, cleanup batch entry if we just created it
                    if is_batch_first {
                        let mut map = BATCH_RESPONSES.lock().await;
                        map.remove(&batch_id);
                    }
                    return;
                }
            };

            let temp_path = save_dir.join(&offer.file_name);
            if let Err(e) = tokio::fs::create_dir_all(&save_dir).await {
                error!("({addr}) Failed to create selected directory: {}", e);
                tauri_log(&app_handle, "error", format!("Failed to create selected directory {}: {}", save_dir.display(), e)).await;
                // On error, cleanup batch entry if we just created it
                if is_batch_first {
                    let mut map = BATCH_RESPONSES.lock().await;
                    map.remove(&batch_id);
                }
                return;
            }
            info!("({addr}) Creating destination file at {:?}", temp_path);
            let mut file = match fs::File::create(&temp_path).await {
                Ok(f) => f,
                Err(e) => {
                    error!("({addr}) Failed to create file: {}", e);
                    tauri_log(&app_handle, "error", format!("Failed to create file {}: {}", temp_path.display(), e)).await;
                    return;
                }
            };
            
            // Receive exactly offer.file_size bytes
            let mut received: u64 = 0;
            let mut buffer = vec![0u8; 64 * 1024];
            let mut last_log = Instant::now();
            let transfer_start = Instant::now();
            info!("({addr}) Beginning binary receive of {} bytes for transfer {}", offer.file_size, transfer_id);
            while received < offer.file_size {
                let to_read = std::cmp::min(buffer.len() as u64, offer.file_size - received) as usize;
                let n = match socket.read(&mut buffer[..to_read]).await {
                    Ok(0) => {
                        error!(
                            "({addr}) Peer closed connection early at {} / {} bytes for transfer {}",
                            received, offer.file_size, transfer_id
                        );
                        return;
                    }
                    Ok(n) => n,
                    Err(e) => {
                        error!("({addr}) Error receiving file: {}", e);
                        return;
                    }
                };
                if let Err(e) = file.write_all(&buffer[..n]).await {
                    error!("({addr}) File write error: {}", e);
                    tauri_log(&app_handle, "error", format!("File write error {}: {}", temp_path.display(), e)).await;
                    return;
                }
                received += n as u64;
                
                // Calcola ETA per il progresso
                let elapsed_ms = transfer_start.elapsed().as_millis();
                let (eta_ms, eta_formatted) = calculate_eta(received, offer.file_size, elapsed_ms);
                
                // Emit progress con ETA
                let progress = serde_json::json!({
                    "transfer_id": transfer_id,
                    "received": received,
                    "total": offer.file_size,
                    "percent": (received as f64 / offer.file_size as f64) * 100.0,
                    "ip": addr.ip().to_string(),
                    "port": addr.port(),
                    "direction": "receive",
                    "eta_ms": eta_ms,
                    "eta_formatted": eta_formatted
                });
                let _ = app_handle.emit("transfer_progress", progress);
                info!("({addr}) Received {} / {} bytes", received, offer.file_size);

                // Throttled log once per second for frontend debugging context
                if last_log.elapsed().as_secs_f64() >= 1.0 {
                    let percent = (received as f64 / offer.file_size as f64) * 100.0;
                    let (_, eta_formatted) = calculate_eta(received, offer.file_size, elapsed_ms);
                    info!(
                        "recv progress | id={} ip={} port={} received={} total={} percent={:.1} eta={}",
                        transfer_id,
                        addr.ip(),
                        addr.port(),
                        received,
                        offer.file_size,
                        percent,
                        eta_formatted
                    );
                    tauri_log(&app_handle, "info", format!(
                        "recv progress | id={} ip={} port={} received={} total={} percent={:.1} eta={}",
                        transfer_id, addr.ip(), addr.port(), received, offer.file_size, percent, eta_formatted
                    )).await;
                    last_log = Instant::now();
                }
            }

            if let Err(e) = file.sync_all().await {
                warn!("({addr}) Failed to fsync file {:?}: {}", temp_path, e);
            }

            // Funzione di dialogo rimossa come richiesto

            let _ = app_handle.emit("transfer_complete", serde_json::json!({
                "transfer_id": transfer_id,
                "path": temp_path,
                "ip": addr.ip().to_string(),
                "port": addr.port(),
                "direction": "receive"
            }));
            info!("({addr}) File transfer complete: {:?}", temp_path);
            tauri_log(&app_handle, "info", format!("receive complete | id={} ip={} port={} path={}", transfer_id, addr.ip(), addr.port(), temp_path.display())).await;

            // Registra nella cronologia (ricezione completata)
            let _ = add_recent_transfer(
                app_handle.clone(),
                offer.file_name.clone(),
                offer.file_size,
                TransferType::Received,
                addr.ip().to_string(),
                addr.ip().to_string(),
                transfer_start.elapsed().as_millis(),
                TransferStatus::Completed,
            ).await;

            // --- PATCH: Do NOT remove batch entry here. Removal must be done only when all files in the batch are complete. ---
            // The entry for batch_id will persist until explicit cleanup logic is added (not here).

            // Gracefully shutdown write half (if any) to signal proper end
            if let Err(e) = AsyncWriteExt::shutdown(&mut socket).await {
                warn!("({addr}) Socket shutdown after receive failed: {}", e);
                tauri_log(&app_handle, "warn", format!("Socket shutdown after receive failed for {}: {}", addr, e)).await;
            }
        });
    }
}

/// Send a file to a peer over TCP.
/// Optionally accepts a batch_id to group multiple files in a batch transfer.
pub async fn send_file(
    target_ip: String,
    target_port: u16,
    path: PathBuf,
    app_handle: tauri::AppHandle,
    batch_id: Option<String>,
) -> anyhow::Result<()> {
    send_file_with_progress(
        target_ip,
        target_port,
        path,
        app_handle,
        None,
        None,
        None,
        None,
        None,
        batch_id,
    ).await
}

/// Send a file to a peer over TCP with progress information.
/// Optionally accepts a batch_id to group multiple files in a batch transfer.
pub async fn send_file_with_progress(
    target_ip: String,
    target_port: u16,
    path: PathBuf,
    app_handle: tauri::AppHandle,
    file_index: Option<usize>,
    total_files: Option<usize>,
    file_name: Option<String>,
    overall_sent: Option<std::sync::Arc<TokioMutex<u64>>>,
    overall_total: Option<u64>,
    batch_id: Option<String>,
) -> anyhow::Result<()> {
    let overall_start = Instant::now();
    let default_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
    let display_name = file_name.as_ref().unwrap_or(&default_name);
    let file_info = if let (Some(idx), Some(total)) = (file_index, total_files) {
        format!(" ({}/{})", idx + 1, total)
    } else {
        String::new()
    };
    
    info!("Starting file send to {}:{} with path {:?}{}", target_ip, target_port, path, file_info);
    tauri_log(&app_handle, "info", format!("send start | ip={} port={} path={} file={}{}", target_ip, target_port, path.display(), display_name, file_info)).await;
    let metadata = fs::metadata(&path).await?;
    let file_size = metadata.len();
    let actual_file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
    let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
    let transfer_id = Uuid::new_v4().to_string();
    // Costruisci FileOffer e assicurati che batch_id sia sempre valorizzato (mai null nel JSON)
    let offer = FileOffer {
        transfer_id: transfer_id.clone(),
        file_name: actual_file_name.clone(),
        file_size,
        mime,
        batch_id: batch_id.clone(),
        sha256: None,
    };

    // Log esplicito con il JSON completo dell'oggetto FileOffer
    let offer_json = serde_json::to_string(&offer).unwrap_or_else(|_| "<error serializing offer>".to_string());
    info!("[SEND] Full FileOffer JSON: {}", offer_json);
    tauri_log(&app_handle, "debug", format!("[SEND] Full FileOffer JSON: {}", offer_json)).await;

    info!(
        "[SEND] Created FileOffer | transfer_id={} batch_id={:?} file_name={}",
        transfer_id, offer.batch_id, actual_file_name
    );
    
    // Log esplicito del batch_id per debug
    if let Some(ref batch_id) = offer.batch_id {
        info!("[SEND] 🔗 Batch ID globale per questo trasferimento: {}", batch_id);
        tauri_log(&app_handle, "info", format!("[SEND] 🔗 Batch ID globale per questo trasferimento: {}", batch_id)).await;
    } else {
        warn!("[SEND] ⚠️ Nessun batch_id fornito per il trasferimento {}", transfer_id);
        tauri_log(&app_handle, "warn", format!("[SEND] ⚠️ Nessun batch_id fornito per il trasferimento {}", transfer_id)).await;
    }
    let addr = format!("{}:{}", target_ip, target_port);
    info!("Connecting to target address: {}", addr);
    tauri_log(&app_handle, "info", format!("Connecting to {}", addr)).await;
    
    // Log delle interfacce locali per debug
    if let Ok(addrs) = get_if_addrs::get_if_addrs() {
        info!("Local network interfaces:");
        for iface in addrs {
            if !iface.is_loopback() {
                info!("  - {}: {}", iface.name, iface.ip());
            }
        }
    }
    
    let mut stream = match TcpStream::connect(&addr).await {
        Ok(s) => {
            info!("Successfully connected to {}", addr);
            s
        }
        Err(e) => {
            error!("Failed to connect to target {}: {}", addr, e);
            tauri_log(&app_handle, "error", format!("Failed to connect to {}: {}", addr, e)).await;
            let _ = add_recent_transfer(
                app_handle.clone(),
                actual_file_name.clone(),
                file_size,
                TransferType::Sent,
                target_ip.clone(),
                target_ip.clone(),
                overall_start.elapsed().as_millis(),
                TransferStatus::Failed,
            ).await;
            return Err(e.into());
        }
    };
    if let Err(e) = stream.set_nodelay(true) {
        warn!("Failed to set TCP_NODELAY on client socket to {}: {}", addr, e);
        tauri_log(&app_handle, "warn", format!("Failed to set TCP_NODELAY on {}: {}", addr, e)).await;
    }

    // Send header JSON + newline
    let header_line = serde_json::to_string(&offer)? + "\n";
    info!("Sending header line: {}", header_line.trim_end());
    if let Err(e) = stream.write_all(header_line.as_bytes()).await {
        error!("Failed to send header: {}", e);
        tauri_log(&app_handle, "error", format!("Failed to send header to {}: {}", addr, e)).await;
        let _ = add_recent_transfer(
            app_handle.clone(),
            actual_file_name.clone(),
            file_size,
            TransferType::Sent,
            target_ip.clone(),
            target_ip.clone(),
            overall_start.elapsed().as_millis(),
            TransferStatus::Failed,
        ).await;
        return Err(e.into());
    }
    if let Err(e) = stream.flush().await {
        warn!("Flush after sending header failed: {}", e);
        tauri_log(&app_handle, "warn", format!("Flush after sending header failed for {}: {}", addr, e)).await;
    } else {
        info!("Header sent and flushed.");
        tauri_log(&app_handle, "info", "Header sent and flushed.").await;
    }

    // Await ack line strictly before sending any binary
    info!("Waiting for ack line from server...");
    let mut ack_buf = Vec::new();
    loop {
        let mut byte = [0u8; 1];
        if let Err(e) = stream.read_exact(&mut byte).await {
            error!("Failed to read ack byte: {}", e);
            tauri_log(&app_handle, "error", format!("Failed to read ack from {}: {}", addr, e)).await;
            let _ = add_recent_transfer(
                app_handle.clone(),
                actual_file_name.clone(),
                file_size,
                TransferType::Sent,
                target_ip.clone(),
                target_ip.clone(),
                overall_start.elapsed().as_millis(),
                TransferStatus::Failed,
            ).await;
            return Err(e.into());
        }
        if byte[0] == b'\n' {
            break;
        }
        ack_buf.push(byte[0]);
        if ack_buf.len() > 8 * 1024 {
            error!("Ack too large (>8KiB) without newline");
            anyhow::bail!("Ack too large");
        }
    }
    let ack_str = match String::from_utf8(ack_buf) {
        Ok(s) => s,
        Err(e) => {
            error!("Invalid ack utf8: {}", e);
            tauri_log(&app_handle, "error", format!("Invalid ack utf8 from {}: {}", addr, e)).await;
            return Err(e.into());
        }
    };
    info!("Received ack line: {}", ack_str);
    tauri_log(&app_handle, "info", format!("Received ack from {}: {}", addr, ack_str)).await;
    let ack_json: serde_json::Value = match serde_json::from_str(&ack_str) {
        Ok(val) => val,
        Err(e) => {
            error!("Invalid ack JSON: {}", e);
            tauri_log(&app_handle, "error", format!("Invalid ack JSON from {}: {}", addr, e)).await;
            return Err(e.into());
        }
    };
    let accepted = ack_json.get("accept").and_then(|v| v.as_bool()).unwrap_or(false);
    if !accepted {
        let err_msg = ack_json.get("error").and_then(|v| v.as_str()).unwrap_or("rejected");
        error!("Transfer rejected by peer: {}", err_msg);
        tauri_log(&app_handle, "error", format!("Transfer rejected by {}: {}", addr, err_msg)).await;
        let _ = add_recent_transfer(
            app_handle.clone(),
            actual_file_name.clone(),
            file_size,
            TransferType::Sent,
            target_ip.clone(),
            target_ip.clone(),
            overall_start.elapsed().as_millis(),
            TransferStatus::Cancelled,
        ).await;
        anyhow::bail!("Transfer rejected by peer: {}", err_msg);
    }
    info!("Ack accepted by server. Beginning binary transfer of {} bytes (transfer_id={})", file_size, transfer_id);
    tauri_log(&app_handle, "info", format!("Ack accepted | id={} size={}", transfer_id, file_size)).await;

    // Send file in chunks
    let mut file = match fs::File::open(&path).await {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to open file: {}", e);
            let _ = add_recent_transfer(
                app_handle.clone(),
                actual_file_name.clone(),
                file_size,
                TransferType::Sent,
                target_ip.clone(),
                target_ip.clone(),
                overall_start.elapsed().as_millis(),
                TransferStatus::Failed,
            ).await;
            return Err(e.into());
        }
    };
    let mut sent: u64 = 0;
    let mut buffer = vec![0u8; 64 * 1024];
    let mut last_log = Instant::now();
    let transfer_start = Instant::now();
    while sent < file_size {
        let to_read = std::cmp::min(buffer.len() as u64, file_size - sent) as usize;
        let n = match file.read(&mut buffer[..to_read]).await {
            Ok(n) => n,
            Err(e) => {
                error!("File read error: {}", e);
                let _ = add_recent_transfer(
                    app_handle.clone(),
                    actual_file_name.clone(),
                    file_size,
                    TransferType::Sent,
                    target_ip.clone(),
                    target_ip.clone(),
                    overall_start.elapsed().as_millis(),
                    TransferStatus::Failed,
                ).await;
                return Err(e.into());
            }
        };
        if n == 0 { break; }
        if let Err(e) = stream.write_all(&buffer[..n]).await {
            error!("Failed to send file chunk at {} bytes: {}", sent, e);
            tauri_log(&app_handle, "error", format!("Failed to send chunk at {} to {}: {}", sent, addr, e)).await;
            let _ = add_recent_transfer(
                app_handle.clone(),
                actual_file_name.clone(),
                file_size,
                TransferType::Sent,
                target_ip.clone(),
                target_ip.clone(),
                overall_start.elapsed().as_millis(),
                TransferStatus::Failed,
            ).await;
            return Err(e.into());
        }
        sent += n as u64;

        let progress_percentage = (sent as f64 / file_size as f64) * 100.0;
        let _ = app_handle.emit("file_progress", progress_percentage);

        // Calcola ETA per il progresso
        let elapsed_ms = transfer_start.elapsed().as_millis();
        let (eta_ms, eta_formatted) = calculate_eta(sent, file_size, elapsed_ms);

        // --- OVERALL PROGRESS SUPPORT ---
        if let (Some(overall_sent), Some(overall_total)) = (&overall_sent, overall_total) {
            let mut global = overall_sent.lock().await;
            *global += n as u64;
            let overall_percent = (*global as f64 / overall_total as f64) * 100.0;
            // Calcolo ETA generale
            let elapsed_ms = transfer_start.elapsed().as_millis();
            let bytes_remaining = overall_total - *global;
            let bytes_per_ms = if elapsed_ms > 0 {
                *global as f64 / elapsed_ms as f64
            } else {
                0.0
            };
            let (overall_eta_ms, overall_eta_formatted) = if *global == 0 || elapsed_ms == 0 || bytes_per_ms <= 0.0 {
                (0u128, "Calcolo ETA...".to_string())
            } else {
                let eta = (bytes_remaining as f64 / bytes_per_ms) as u128;
                let eta_formatted = if eta < 1000 {
                    format!("{}ms rimanenti", eta)
                } else if eta < 60000 {
                    format!("{:.0}s rimanenti", eta as f64 / 1000.0)
                } else if eta < 3600000 {
                    let minutes = eta / 60000;
                    let seconds = (eta % 60000) / 1000;
                    format!("{}m {}s rimanenti", minutes, seconds)
                } else {
                    let hours = eta / 3600000;
                    let minutes = (eta % 3600000) / 60000;
                    format!("{}h {}m rimanenti", hours, minutes)
                };
                (eta, eta_formatted)
            };
            let progress = serde_json::json!({
                "transfer_id": transfer_id,
                "sent": sent,
                "total": file_size,
                "percent": progress_percentage,
                "overall_sent": *global,
                "overall_total": overall_total,
                "overall_percent": overall_percent,
                "ip": target_ip,
                "port": target_port,
                "direction": "send",
                "eta_ms": eta_ms,
                "eta_formatted": eta_formatted,
                "overall_eta_ms": overall_eta_ms,
                "overall_eta_formatted": overall_eta_formatted
            });
            let _ = app_handle.emit("transfer_progress", progress);
        } else {
            let progress = serde_json::json!({
                "transfer_id": transfer_id,
                "sent": sent,
                "total": file_size,
                "percent": progress_percentage,
                "ip": target_ip,
                "port": target_port,
                "direction": "send",
                "eta_ms": eta_ms,
                "eta_formatted": eta_formatted
            });
            let _ = app_handle.emit("transfer_progress", progress);
        }
        // --- END OVERALL PROGRESS SUPPORT ---
        info!("Sent {} / {} bytes", sent, file_size);

        // Log solo per il progresso generale, non per ogni file
        if let (Some(overall_sent), Some(overall_total)) = (&overall_sent, overall_total) {
            if last_log.elapsed().as_secs_f64() >= 1.0 {
                let global = overall_sent.lock().await;
                let overall_percent = (*global as f64 / overall_total as f64) * 100.0;
                let elapsed_ms = transfer_start.elapsed().as_millis();
                let bytes_remaining = overall_total - *global;
                let bytes_per_ms = if elapsed_ms > 0 {
                    *global as f64 / elapsed_ms as f64
                } else {
                    0.0
                };
                let overall_eta_formatted = if *global == 0 || elapsed_ms == 0 || bytes_per_ms <= 0.0 {
                    "Calcolo ETA...".to_string()
                } else {
                    let eta = (bytes_remaining as f64 / bytes_per_ms) as u128;
                    if eta < 1000 {
                        format!("{}ms rimanenti", eta)
                    } else if eta < 60000 {
                        format!("{:.0}s rimanenti", eta as f64 / 1000.0)
                    } else if eta < 3600000 {
                        let minutes = eta / 60000;
                        let seconds = (eta % 60000) / 1000;
                        format!("{}m {}s rimanenti", minutes, seconds)
                    } else {
                        let hours = eta / 3600000;
                        let minutes = (eta % 3600000) / 60000;
                        format!("{}h {}m rimanenti", hours, minutes)
                    }
                };
                
                let batch_info = if let Some(ref batch_id) = batch_id {
                    format!(" batch_id={}", batch_id)
                } else {
                    " batch_id=none".to_string()
                };
                
                info!(
                    "send progress | id={} ip={} port={} overall_sent={} overall_total={} overall_percent={:.1} overall_eta={}{}",
                    transfer_id,
                    addr.split(':').next().unwrap_or(""),
                    addr.split(':').nth(1).unwrap_or(""),
                    *global,
                    overall_total,
                    overall_percent,
                    overall_eta_formatted,
                    batch_info
                );
                tauri_log(&app_handle, "info", format!(
                    "send progress | id={} ip={} port={} overall_sent={} overall_total={} overall_percent={:.1} overall_eta={}{}",
                    transfer_id,
                    addr.split(':').next().unwrap_or(""),
                    addr.split(':').nth(1).unwrap_or(""),
                    *global,
                    overall_total,
                    overall_percent,
                    overall_eta_formatted,
                    batch_info
                )).await;
                last_log = Instant::now();
            }
        }
    }

    if let Err(e) = stream.flush().await {
        warn!("Flush after sending file failed: {}", e);
        tauri_log(&app_handle, "warn", format!("Flush after sending file failed for {}: {}", addr, e)).await;
    } else {
        info!("File data flushed to socket.");
        tauri_log(&app_handle, "info", "File data flushed to socket.").await;
    }

    // gracefully close the write half to signal EOF to the server
    if let Err(e) = AsyncWriteExt::shutdown(&mut stream).await {
        warn!("Socket shutdown after send failed: {}", e);
        tauri_log(&app_handle, "warn", format!("Socket shutdown after send failed for {}: {}", addr, e)).await;
    } else {
        info!("Write half shutdown completed.");
        tauri_log(&app_handle, "info", "Write half shutdown completed.").await;
    }

    let _ = app_handle.emit("transfer_complete", serde_json::json!({
        "transfer_id": transfer_id,
        "path": path,
        "ip": target_ip,
        "port": target_port,
        "direction": "send"
    }));
    info!("Invio del file completato: {:?}", path);
    info!("Target: {}:{}, Local addr: {}", target_ip, target_port, addr);
    let file_info = if let (Some(idx), Some(total)) = (file_index, total_files) {
        format!(" file={} ({}/{})", display_name, idx + 1, total)
    } else {
        format!(" file={}", display_name)
    };
    
    let batch_info = if let Some(ref batch_id) = batch_id {
        format!(" batch_id={}", batch_id)
    } else {
        " batch_id=none".to_string()
    };
    
    tauri_log(
        &app_handle,
        "info",
        format!(
            "send complete | id={} ip={} port={} path={}{}{}",
            transfer_id,
            addr.split(':').next().unwrap_or(""),
            addr.split(':').nth(1).unwrap_or(""),
            path.display(),
            file_info,
            batch_info
        )
    ).await;
    // Salvataggio record completato (invio)
    let elapsed_ms = overall_start.elapsed().as_millis();
    let _ = add_recent_transfer(
        app_handle.clone(),
        actual_file_name.clone(),
        file_size,
        TransferType::Sent,
        target_ip.clone(),
        target_ip.clone(),
        elapsed_ms,
        TransferStatus::Completed,
    ).await;

    // Funzione di dialogo rimossa come richiesto
    Ok(())
}

#[tauri::command]
pub async fn get_system_stats() -> Result<serde_json::Value, String> {
    use std::thread;
    use std::time::Duration;
    
    let mut sys = System::new_all();
    
    // Prima misurazione (baseline)
    sys.refresh_cpu();
    
    // Attendi un breve intervallo (200ms è sufficiente)
    thread::sleep(Duration::from_millis(200));
    
    // Seconda misurazione per ottenere l'uso effettivo
    sys.refresh_cpu();
    sys.refresh_memory();
    
    // CPU usage globale (0.0 .. 100.0)
    let cpu = sys.global_cpu_info().cpu_usage();
    
    // Memoria: used / total
    let total = sys.total_memory() as f32;
    let used = sys.used_memory() as f32;
    let mem_percent = if total > 0.0 { (used / total) * 100.0 } else { 0.0 };
    
    Ok(serde_json::json!({
        "cpu": (cpu * 10.0).round() / 10.0,
        "memory": (mem_percent * 10.0).round() / 10.0
    }))
}

use chrono::Local;
// helper: controlla se una data (rfc3339) è "oggi"
fn datetime_is_today(s: &str) -> bool {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        // Converti a timezone locale
        let dt_local = dt.with_timezone(&Local).date_naive();
        let today = Local::now().date_naive();
        return dt_local == today;
    }
    false
}

#[tauri::command]
pub async fn get_today_stats(
    selected_names: Option<Vec<String>>,
    selected_ips: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    // Leggi i recent transfers file (se non esiste restituisci zero)
    let mut path = dirs::data_dir().ok_or_else(|| "impossibile ottenere data_dir".to_string())?;
    path.push("AirShare");
    path.push("recent_transfers.json");
    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(_) => Vec::new(),
    };
    let records: Vec<TransferRecord> = if bytes.is_empty() {
        Vec::new()
    } else {
        match serde_json::from_slice::<Vec<TransferRecord>>(&bytes) {
            Ok(v) => v,
            Err(_) => Vec::new(),
        }
    };

    // Prepara set di filtri (se forniti)
    let names_set: std::collections::HashSet<String> = selected_names.unwrap_or_default().into_iter().collect();
    let ips_set: std::collections::HashSet<String> = selected_ips.unwrap_or_default().into_iter().collect();
    let filter_by_selection = !(names_set.is_empty() && ips_set.is_empty());

    // Filtra i record per "oggi" e per selezione (se richiesta)
    let relevant: Vec<&TransferRecord> = records.iter()
        .filter(|r| datetime_is_today(&r.start_time))
        .filter(|r| {
            if !filter_by_selection {
                return true;
            }
            let from = r.from_device.to_string();
            let to = r.to_device.to_string();
            names_set.contains(&from) || names_set.contains(&to) || 
            ips_set.contains(&from) || ips_set.contains(&to)
        })
        .collect();

    // Considera solo completati
    let completed: Vec<&&TransferRecord> = relevant.iter()
        .filter(|r| matches!(r.status, TransferStatus::Completed))
        .collect();
    
    let count = completed.len();
    let avg_speed = if count > 0 {
        let sum: f64 = completed.iter().map(|r| r.speed).sum();
        (sum / count as f64 * 10.0).round() / 10.0
    } else {
        0.0
    };

    Ok(serde_json::json!({
        "transfers_today": count,
        "avg_speed": avg_speed
    }))
}
