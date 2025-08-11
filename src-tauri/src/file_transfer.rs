


use tauri::Emitter;
use tokio::{
    net::{TcpListener, TcpStream},
    io::{AsyncReadExt, AsyncWriteExt},
};
use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use uuid::Uuid;
use log::{info, error};
use tokio::fs;

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
        let (mut socket, _addr) = match listener.accept().await {
            Ok(res) => {
                info!("Accepted new connection");
                res
            },
            Err(e) => {
                error!("Failed to accept connection: {}", e);
                return Err(e.into());
            }
        };
        let app_handle = app_handle.clone();
        tokio::spawn(async move {
            // Read header JSON until newline
            let mut header_buf = Vec::new();
            loop {
                let mut byte = [0u8; 1];
                if let Err(e) = socket.read_exact(&mut byte).await {
                    error!("Failed to read header byte: {}", e);
                    return;
                }
                if byte[0] == b'\n' {
                    break;
                }
                header_buf.push(byte[0]);
                // Limit header size for safety
                if header_buf.len() > 16 * 1024 {
                    error!("Header too large");
                    return;
                }
            }
            info!("Read header bytes, length: {}", header_buf.len());
            let header_str = match String::from_utf8(header_buf) {
                Ok(s) => s,
                Err(e) => {
                    error!("Invalid header utf8: {}", e);
                    return;
                }
            };
            info!("Received header: {}", header_str);
            let offer: FileOffer = match serde_json::from_str(&header_str) {
                Ok(o) => o,
                Err(e) => {
                    error!("Invalid header JSON: {}", e);
                    return;
                }
            };
            info!("Parsed file offer: {:?}", offer);
            // Emit event to frontend
            let transfer_id = offer.transfer_id.clone();
            info!("Emitting transfer_request event for id: {}", transfer_id);
            let _ = app_handle.emit("transfer_request", &offer);
            // Simulate accept for now
            let accept = true;
            // Send ack JSON (could be expanded for real user response)
            let ack = serde_json::json!({ "accept": accept });
            let ack_str = serde_json::to_string(&ack).unwrap() + "\n";
            if let Err(e) = socket.write_all(ack_str.as_bytes()).await {
                error!("Failed to write ack: {}", e);
                return;
            }
            info!("Sent ack to client");
            if !accept {
                info!("Transfer rejected");
                return;
            }
            // Create temp file
            let temp_path = std::env::temp_dir().join(format!("airshare-{}", offer.file_name));
            let mut file = match fs::File::create(&temp_path).await {
                Ok(f) => f,
                Err(e) => {
                    error!("Failed to create file: {}", e);
                    return;
                }
            };
            let mut received: u64 = 0;
            let mut buffer = vec![0u8; 64 * 1024];
            while received < offer.file_size {
                let to_read = std::cmp::min(buffer.len() as u64, offer.file_size - received) as usize;
                let n = match socket.read(&mut buffer[..to_read]).await {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(e) => {
                        error!("Error receiving file: {}", e);
                        return;
                    }
                };
                if let Err(e) = file.write_all(&buffer[..n]).await {
                    error!("File write error: {}", e);
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
                info!("Received {} / {} bytes", received, offer.file_size);
            }
            let _ = app_handle.emit("transfer_complete", serde_json::json!({
                "transfer_id": transfer_id,
                "path": temp_path,
            }));
            info!("File transfer complete: {:?}", temp_path);
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
    // Send header JSON + newline
    let header = serde_json::to_string(&offer)? + "\n";
    // Log the header content as JSON string before sending
    info!("Header JSON to send: {}", header.trim_end());
    match stream.write_all(header.as_bytes()).await {
        Ok(_) => info!("Sent header to target"),
        Err(e) => {
            error!("Failed to send header: {}", e);
            return Err(e.into());
        }
    }
    // Await ack
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
            error!("Ack too large");
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
    info!("Received ack: {}", ack_str);
    let ack_json: serde_json::Value = match serde_json::from_str(&ack_str) {
        Ok(val) => val,
        Err(e) => {
            error!("Invalid ack JSON: {}", e);
            return Err(e.into());
        }
    };
    if !ack_json.get("accept").and_then(|v| v.as_bool()).unwrap_or(false) {
        error!("Transfer rejected by peer");
        anyhow::bail!("Transfer rejected by peer");
    }
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
            error!("Failed to send file chunk: {}", e);
            return Err(e.into());
        }
        sent += n as u64;
        // Emit progress
        let progress = serde_json::json!({
            "transfer_id": transfer_id,
            "sent": sent,
            "total": file_size
        });
        let _ = app_handle.emit("transfer_progress", progress);
        info!("Sent {} / {} bytes", sent, file_size);
    }
    let _ = app_handle.emit("transfer_complete", serde_json::json!({
        "transfer_id": transfer_id,
        "path": path,
    }));
    info!("File send complete: {:?}", path);
    Ok(())
}