use tauri::Emitter;
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
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use dirs;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOffer {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub mime: String,
    pub sha256: Option<String>,
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
            info!("({addr}) Parsed file offer: {:?}", offer);
            tauri_log(&app_handle, "info", format!("Parsed file offer from {}: {} ({} bytes)", addr, offer.file_name, offer.file_size)).await;

            // Emit event to frontend (include source address info)
            let transfer_id = offer.transfer_id.clone();
            info!("({addr}) Emitting transfer_request event for id: {}", transfer_id);
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

            // For now, auto-accept
            let accept = true;

            // Send ack JSON (expanded for potential error reporting)
            let ack = if accept {
                serde_json::json!({ "accept": true })
            } else {
                serde_json::json!({ "accept": false })
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
                    return;
                }
            }
            if !accept {
                info!("({addr}) Transfer rejected by server policy.");
                return;
            }

            // Create temp file
            let mut documents_dir = dirs::document_dir().unwrap_or(std::env::temp_dir());
            documents_dir.push("AirShare");
            if let Err(e) = tokio::fs::create_dir_all(&documents_dir).await {
                error!("Failed to create AirShare directory: {}", e);
                return;
            }
            let temp_path = documents_dir.join(&offer.file_name);
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
                // Emit progress
                let progress = serde_json::json!({
                    "transfer_id": transfer_id,
                    "received": received,
                    "total": offer.file_size,
                    "percent": (received as f64 / offer.file_size as f64) * 100.0,
                    "ip": addr.ip().to_string(),
                    "port": addr.port(),
                    "direction": "receive"
                });
                let _ = app_handle.emit("transfer_progress", progress);
                info!("({addr}) Received {} / {} bytes", received, offer.file_size);

                // Throttled log once per second for frontend debugging context
                if last_log.elapsed().as_secs_f64() >= 1.0 {
                    let percent = (received as f64 / offer.file_size as f64) * 100.0;
                    info!(
                        "recv progress | id={} ip={} port={} received={} total={} percent={:.1}",
                        transfer_id,
                        addr.ip(),
                        addr.port(),
                        received,
                        offer.file_size,
                        percent
                    );
                    tauri_log(&app_handle, "info", format!(
                        "recv progress | id={} ip={} port={} received={} total={} percent={:.1}",
                        transfer_id, addr.ip(), addr.port(), received, offer.file_size, percent
                    )).await;
                    last_log = Instant::now();
                }
            }

            if let Err(e) = file.sync_all().await {
                warn!("({addr}) Failed to fsync file {:?}: {}", temp_path, e);
            }

            app_handle.dialog().message(format!("File '{}' salvato in '{}'", offer.file_name, temp_path.display()))
                .title("AirShare")
                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                .show(|_| {});

            let _ = app_handle.emit("transfer_complete", serde_json::json!({
                "transfer_id": transfer_id,
                "path": temp_path,
                "ip": addr.ip().to_string(),
                "port": addr.port(),
                "direction": "receive"
            }));
            info!("({addr}) File transfer complete: {:?}", temp_path);
            tauri_log(&app_handle, "info", format!("receive complete | id={} ip={} port={} path={}", transfer_id, addr.ip(), addr.port(), temp_path.display())).await;

            // Gracefully shutdown write half (if any) to signal proper end
            if let Err(e) = AsyncWriteExt::shutdown(&mut socket).await {
                warn!("({addr}) Socket shutdown after receive failed: {}", e);
                tauri_log(&app_handle, "warn", format!("Socket shutdown after receive failed for {}: {}", addr, e)).await;
            }
        });
    }
}

/// Send a file to a peer over TCP.
pub async fn send_file(target_ip: String, target_port: u16, path: PathBuf, app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    info!("Starting file send to {}:{} with path {:?}", target_ip, target_port, path);
    tauri_log(&app_handle, "info", format!("send start | ip={} port={} path={}", target_ip, target_port, path.display())).await;
    let metadata = fs::metadata(&path).await?;
    let file_size = metadata.len();
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
    let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
    let transfer_id = Uuid::new_v4().to_string();
    let offer = FileOffer {
        transfer_id: transfer_id.clone(),
        file_name: file_name.clone(),
        file_size,
        mime,
        sha256: None,
    };
    let addr = format!("{}:{}", target_ip, target_port);
    info!("Connecting to target address: {}", addr);
    tauri_log(&app_handle, "info", format!("Connecting to {}", addr)).await;
    let mut stream = match TcpStream::connect(&addr).await {
        Ok(s) => s,
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

        let progress = serde_json::json!({
            "transfer_id": transfer_id,
            "sent": sent,
            "total": file_size,
            "percent": progress_percentage,
            "ip": target_ip,
            "port": target_port,
            "direction": "send"
        });
        let _ = app_handle.emit("transfer_progress", progress);
        info!("Sent {} / {} bytes", sent, file_size);

        // Throttled log once per second for frontend debugging context
        if last_log.elapsed().as_secs_f64() >= 1.0 {
            info!(
                "send progress | id={} ip={} port={} sent={} total={} percent={:.1}",
                transfer_id,
                addr.split(':').next().unwrap_or("") ,
                addr.split(':').nth(1).unwrap_or("") ,
                sent,
                file_size,
                progress_percentage
            );
            tauri_log(&app_handle, "info", format!(
                "send progress | id={} ip={} port={} sent={} total={} percent={:.1}",
                transfer_id,
                addr.split(':').next().unwrap_or(""),
                addr.split(':').nth(1).unwrap_or(""),
                sent,
                file_size,
                progress_percentage
            )).await;
            last_log = Instant::now();
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
    info!("File send complete: {:?}", path);
    tauri_log(&app_handle, "info", format!("send complete | id={} ip={} port={} path={}", transfer_id, addr.split(':').next().unwrap_or(""), addr.split(':').nth(1).unwrap_or(""), path.display())).await;
    Ok(())
}