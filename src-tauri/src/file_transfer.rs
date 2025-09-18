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

// Global shared state for transfer responses
static TRANSFER_RESPONSES: Lazy<TokioMutex<HashMap<String, bool>>> = Lazy::new(|| TokioMutex::new(HashMap::new()));

// Batch responses: batch_id -> (accept, Option<PathBuf>)
static BATCH_RESPONSES: Lazy<TokioMutex<HashMap<String, (bool, Option<PathBuf>)>>> =
    Lazy::new(|| TokioMutex::new(HashMap::new()));

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RespondTransferArgs {
    #[serde(alias = "transfer_id")]
    pub transfer_id: String,
    pub accept: bool,
}

#[tauri::command]
pub async fn respond_transfer(args: RespondTransferArgs) {
    let mut map = TRANSFER_RESPONSES.lock().await;
    map.insert(args.transfer_id, args.accept);
}
use dirs;
use tauri::AppHandle;

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
            let batch_id = offer.batch_id.clone().unwrap_or_else(|| offer.transfer_id.clone());
            info!("({addr}) Parsed file offer: {:?}, batch_id: {}", offer, batch_id);
            tauri_log(&app_handle, "info", format!("Parsed file offer from {}: {} ({} bytes)", addr, offer.file_name, offer.file_size)).await;

            let transfer_id = offer.transfer_id.clone();
            let mut accept: bool;
            let mut save_dir: Option<PathBuf>;
            let mut is_batch_first = false;
            // --- PATCH: Check BATCH_RESPONSES with exact batch_id before asking frontend ---
            {
                let map = BATCH_RESPONSES.lock().await;
                if let Some((a, d)) = map.get(&batch_id) {
                    info!("({addr}) [BATCH] Existing batch_id {} found. Reusing accept/dir for new connection.", batch_id);
                    tauri_log(&app_handle, "info", format!("[BATCH] Existing batch_id {} found. Reusing accept/dir for new connection from {}.", batch_id, addr)).await;
                    accept = *a;
                    save_dir = d.clone();
                } else {
                    info!("({addr}) [BATCH] No entry for batch_id {}. Asking user for confirmation/folder.", batch_id);
                    tauri_log(&app_handle, "info", format!("[BATCH] No entry for batch_id {}. Asking user for confirmation/folder from {}.", batch_id, addr)).await;
                    is_batch_first = true;
                    accept = false; // to be set below
                    save_dir = None;
                }
            }
            if is_batch_first {
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
                    // Aspetta che l'utente selezioni una cartella (con timeout)
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
            // Send ack JSON (expanded for potential error reporting)
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
// Assicura che il batch_id venga usato esattamente come passato dal frontend
let offer = FileOffer {
    transfer_id: transfer_id.clone(),
    file_name: actual_file_name.clone(),
    file_size,
    mime,
    batch_id: batch_id.clone(), // ← usa quello ricevuto
    sha256: None,
};

info!(
    "[SEND] Created FileOffer | transfer_id={} batch_id={:?} file_name={}",
    transfer_id, batch_id, actual_file_name
);
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
        anyhow::bail!("Transfer rejected by peer: {}", err_msg);
    }
    info!("Ack accepted by server. Beginning binary transfer of {} bytes (transfer_id={})", file_size, transfer_id);
    tauri_log(&app_handle, "info", format!("Ack accepted | id={} size={}", transfer_id, file_size)).await;

    // Send file in chunks
    let mut file = match fs::File::open(&path).await {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to open file: {}", e);
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
                return Err(e.into());
            }
        };
        if n == 0 { break; }
        if let Err(e) = stream.write_all(&buffer[..n]).await {
            error!("Failed to send file chunk at {} bytes: {}", sent, e);
            tauri_log(&app_handle, "error", format!("Failed to send chunk at {} to {}: {}", sent, addr, e)).await;
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
                
                info!(
                    "send progress | id={} ip={} port={} overall_sent={} overall_total={} overall_percent={:.1} overall_eta={}",
                    transfer_id,
                    addr.split(':').next().unwrap_or(""),
                    addr.split(':').nth(1).unwrap_or(""),
                    *global,
                    overall_total,
                    overall_percent,
                    overall_eta_formatted
                );
                tauri_log(&app_handle, "info", format!(
                    "send progress | id={} ip={} port={} overall_sent={} overall_total={} overall_percent={:.1} overall_eta={}",
                    transfer_id,
                    addr.split(':').next().unwrap_or(""),
                    addr.split(':').nth(1).unwrap_or(""),
                    *global,
                    overall_total,
                    overall_percent,
                    overall_eta_formatted
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
    
    tauri_log(
        &app_handle,
        "info",
        format!(
            "send complete | id={} ip={} port={} path={}{}",
            transfer_id,
            addr.split(':').next().unwrap_or(""),
            addr.split(':').nth(1).unwrap_or(""),
            path.display(),
            file_info
        )
    ).await;
    // Funzione di dialogo rimossa come richiesto
    Ok(())
}