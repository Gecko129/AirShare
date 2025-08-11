


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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOffer {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub mime: String,
    pub sha256: Option<String>,
}

/// Start a TCP file server for incoming file transfers.
pub async fn start_file_server(app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    let listener = TcpListener::bind("0.0.0.0:40124").await?;
    info!("File server listening on 0.0.0.0:40124");
    info!("Entering file server loop");
    loop {
        let (mut socket, addr) = match listener.accept().await {
            Ok(res) => {
                info!("Accepted new connection from {}", res.1);
                res
            },
            Err(e) => {
                error!("Failed to accept connection: {}", e);
                return Err(e.into());
            }
        };

        if let Err(e) = socket.set_nodelay(true) {
            warn!("Failed to set TCP_NODELAY on {}: {}", addr, e);
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

            // Emit event to frontend
            let transfer_id = offer.transfer_id.clone();
            info!("({addr}) Emitting transfer_request event for id: {}", transfer_id);
            let _ = app_handle.emit("transfer_request", &offer);

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
                    if let Err(e) = socket.flush().await {
                        warn!("({addr}) Flush after ack failed: {}", e);
                    }
                }
                Err(e) => {
                    error!("({addr}) Failed to write ack: {}", e);
                    return;
                }
            }
            if !accept {
                info!("({addr}) Transfer rejected by server policy.");
                return;
            }

            // Create temp file
            let temp_path = std::env::temp_dir().join(format!("airshare-{}", offer.file_name));
            info!("({addr}) Creating destination file at {:?}", temp_path);
            let mut file = match fs::File::create(&temp_path).await {
                Ok(f) => f,
                Err(e) => {
                    error!("({addr}) Failed to create file: {}", e);
                    return;
                }
            };

            // Receive exactly offer.file_size bytes
            let mut received: u64 = 0;
            let mut buffer = vec![0u8; 64 * 1024];
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
                    return;
                }
                received += n as u64;
                // Emit progress
                let progress = serde_json::json!({
                    "transfer_id": transfer_id,
                    "received": received,
                    "total": offer.file_size
                });
                let _ = app_handle.emit("transfer_progress", progress);
                info!("({addr}) Received {} / {} bytes", received, offer.file_size);
            }

            if let Err(e) = file.sync_all().await {
                warn!("({addr}) Failed to fsync file {:?}: {}", temp_path, e);
            }

            let _ = app_handle.emit("transfer_complete", serde_json::json!({
                "transfer_id": transfer_id,
                "path": temp_path,
            }));
            info!("({addr}) File transfer complete: {:?}", temp_path);

            // Gracefully shutdown write half (if any) to signal proper end
            if let Err(e) = AsyncWriteExt::shutdown(&mut socket).await {
                warn!("({addr}) Socket shutdown after receive failed: {}", e);
            }
        });
    }
}

/// Send a file to a peer over TCP.
pub async fn send_file(target_ip: String, path: PathBuf, app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    info!("Starting file send to {} with path {:?}", target_ip, path);
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
    let addr = format!("{}:40124", target_ip);
    info!("Connecting to target address: {}", addr);
    let mut stream = match TcpStream::connect(&addr).await {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to connect to target {}: {}", addr, e);
            return Err(e.into());
        }
    };
    if let Err(e) = stream.set_nodelay(true) {
        warn!("Failed to set TCP_NODELAY on client socket to {}: {}", addr, e);
    }

    // Send header JSON + newline
    let header_line = serde_json::to_string(&offer)? + "\n";
    info!("Sending header line: {}", header_line.trim_end());
    if let Err(e) = stream.write_all(header_line.as_bytes()).await {
        error!("Failed to send header: {}", e);
        return Err(e.into());
    }
    if let Err(e) = stream.flush().await {
        warn!("Flush after sending header failed: {}", e);
    } else {
        info!("Header sent and flushed.");
    }

    // Await ack line strictly before sending any binary
    info!("Waiting for ack line from server...");
    let mut ack_buf = Vec::new();
    loop {
        let mut byte = [0u8; 1];
        if let Err(e) = stream.read_exact(&mut byte).await {
            error!("Failed to read ack byte: {}", e);
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
            return Err(e.into());
        }
    };
    info!("Received ack line: {}", ack_str);
    let ack_json: serde_json::Value = match serde_json::from_str(&ack_str) {
        Ok(val) => val,
        Err(e) => {
            error!("Invalid ack JSON: {}", e);
            return Err(e.into());
        }
    };
    let accepted = ack_json.get("accept").and_then(|v| v.as_bool()).unwrap_or(false);
    if !accepted {
        let err_msg = ack_json.get("error").and_then(|v| v.as_str()).unwrap_or("rejected");
        error!("Transfer rejected by peer: {}", err_msg);
        anyhow::bail!("Transfer rejected by peer: {}", err_msg);
    }
    info!("Ack accepted by server. Beginning binary transfer of {} bytes (transfer_id={})", file_size, transfer_id);

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
            return Err(e.into());
        }
        sent += n as u64;

        let progress = serde_json::json!({
            "transfer_id": transfer_id,
            "sent": sent,
            "total": file_size
        });
        let _ = app_handle.emit("transfer_progress", progress);
        info!("Sent {} / {} bytes", sent, file_size);
    }

    if let Err(e) = stream.flush().await {
        warn!("Flush after sending file failed: {}", e);
    } else {
        info!("File data flushed to socket.");
    }

    // gracefully close the write half to signal EOF to the server
    if let Err(e) = AsyncWriteExt::shutdown(&mut stream).await {
        warn!("Socket shutdown after send failed: {}", e);
    } else {
        info!("Write half shutdown completed.");
    }

    let _ = app_handle.emit("transfer_complete", serde_json::json!({
        "transfer_id": transfer_id,
        "path": path,
    }));
    info!("File send complete: {:?}", path);
    Ok(())
}