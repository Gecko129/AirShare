

use tokio::{
    net::{TcpListener, TcpStream},
    io::{AsyncReadExt, AsyncWriteExt},
};
use serde::{Serialize, Deserialize};
use std::{
    sync::{Arc, Mutex},
    path::PathBuf,
};
use uuid::Uuid;
use log::{info, error};
use tokio::fs;
use tauri::Manager;

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
    loop {
        let (mut socket, addr) = listener.accept().await?;
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
            let header_str = match String::from_utf8(header_buf) {
                Ok(s) => s,
                Err(e) => {
                    error!("Invalid header utf8: {}", e);
                    return;
                }
            };
            let offer: FileOffer = match serde_json::from_str(&header_str) {
                Ok(o) => o,
                Err(e) => {
                    error!("Invalid header JSON: {}", e);
                    return;
                }
            };
            info!("Incoming file offer: {:?}", offer);
            // Emit event to frontend
            let transfer_id = offer.transfer_id.clone();
            let _ = app_handle.emit_all("transfer_request", &offer);
            // Simulate accept for now
            let accept = true;
            // Send ack JSON (could be expanded for real user response)
            let ack = serde_json::json!({ "accept": accept });
            let ack_str = serde_json::to_string(&ack).unwrap() + "\n";
            if let Err(e) = socket.write_all(ack_str.as_bytes()).await {
                error!("Failed to write ack: {}", e);
                return;
            }
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
                let _ = app_handle.emit_all("transfer_progress", progress);
            }
            let _ = app_handle.emit_all("transfer_complete", serde_json::json!({
                "transfer_id": transfer_id,
                "path": temp_path,
            }));
            info!("File transfer complete: {:?}", temp_path);
        });
    }
}

/// Send a file to a peer over TCP.
pub async fn send_file(target_ip: String, path: PathBuf, app_handle: tauri::AppHandle) -> anyhow::Result<()> {
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
    let mut stream = TcpStream::connect(&addr).await?;
    // Send header JSON + newline
    let header = serde_json::to_string(&offer)? + "\n";
    stream.write_all(header.as_bytes()).await?;
    // Await ack
    let mut ack_buf = Vec::new();
    loop {
        let mut byte = [0u8; 1];
        stream.read_exact(&mut byte).await?;
        if byte[0] == b'\n' {
            break;
        }
        ack_buf.push(byte[0]);
        if ack_buf.len() > 8 * 1024 {
            anyhow::bail!("Ack too large");
        }
    }
    let ack_str = String::from_utf8(ack_buf)?;
    let ack_json: serde_json::Value = serde_json::from_str(&ack_str)?;
    if !ack_json.get("accept").and_then(|v| v.as_bool()).unwrap_or(false) {
        anyhow::bail!("Transfer rejected by peer");
    }
    // Send file in chunks
    let mut file = fs::File::open(&path).await?;
    let mut sent: u64 = 0;
    let mut buffer = vec![0u8; 64 * 1024];
    while sent < file_size {
        let to_read = std::cmp::min(buffer.len() as u64, file_size - sent) as usize;
        let n = file.read(&mut buffer[..to_read]).await?;
        if n == 0 { break; }
        stream.write_all(&buffer[..n]).await?;
        sent += n as u64;
        // Emit progress
        let progress = serde_json::json!({
            "transfer_id": transfer_id,
            "sent": sent,
            "total": file_size
        });
        let _ = app_handle.emit_all("transfer_progress", progress);
    }
    let _ = app_handle.emit_all("transfer_complete", serde_json::json!({
        "transfer_id": transfer_id,
        "path": path,
    }));
    Ok(())
}