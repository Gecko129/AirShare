#![allow(unused_imports)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;

mod file_transfer;

use std::{
    sync::{Arc, Mutex},
    net::{SocketAddr},
    time::{Duration, Instant},
};
use tokio::time;
use tokio::net::UdpSocket as TokioUdpSocket;
use serde::{Serialize, Deserialize};
use chrono::Utc;
use log::{warn, error};
use get_if_addrs::get_if_addrs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use std::path::Path;
use tauri::Emitter;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Device {
    name: String,
    ip: String,
    port: u16,
    status: String,
    last_seen: String,
}

#[derive(Clone, Debug)]
struct DeviceEntry {
    device: Device,
    last_seen_instant: Instant,
}



type SharedDevices = Arc<Mutex<Vec<DeviceEntry>>>;

const BROADCAST_PORT: u16 = 40123;
const HEARTBEAT_INTERVAL_SECS: u64 = 2;
const DEVICE_TIMEOUT_SECS: u64 = 5;

fn get_local_ip() -> Option<String> {
    if let Ok(addrs) = get_if_addrs() {
        for iface in addrs {
            if !iface.is_loopback() {
                if let std::net::IpAddr::V4(ipv4) = iface.ip() {
                    return Some(ipv4.to_string());
                }
            }
        }
    }
    None
}

use tauri_plugin_dialog;

#[tokio::main]
async fn main() {
    let devices: SharedDevices = Arc::new(Mutex::new(Vec::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(devices)
        .setup(|app| {
            // Clone the app handle before moving it into async tasks
            let app_handle = app.handle().clone();
            let devices_for_listener = app.state::<SharedDevices>().inner().clone();
            let devices_for_cleanup = app.state::<SharedDevices>().inner().clone();

            // Now spawn the tasks with the cloned handle
            tokio::spawn(async move {
                if let Err(e) = file_transfer::start_file_server(app_handle).await {
                    error!("File server error: {}", e);
                }
            });

            tokio::spawn(async move {
                udp_broadcast_heartbeat_loop().await;
            });
            tokio::spawn(async move {
                udp_listener_loop(devices_for_listener).await;
            });
            tokio::spawn(async move {
                cleanup_loop(devices_for_cleanup).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_devices, send_file, send_file_with_progress, file_transfer::get_file_info])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}

async fn udp_broadcast_heartbeat_loop() {
    let name = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());
    let port = BROADCAST_PORT;
    let ip = get_local_ip().unwrap_or_else(|| "0.0.0.0".to_string());
    let device = Device {
        name,
        ip,
        port,
        status: "Online".to_string(),
        last_seen: Utc::now().to_rfc3339(),
    };
    let socket = TokioUdpSocket::bind(("0.0.0.0", 0)).await.expect("bind failed");
    socket.set_broadcast(true).expect("set broadcast failed");
    let broadcast_addr = SocketAddr::from(([255,255,255,255], BROADCAST_PORT));
    loop {
        let mut to_send = device.clone();
        to_send.last_seen = Utc::now().to_rfc3339();
        let json = serde_json::to_string(&to_send).unwrap();
        let _ = socket.send_to(json.as_bytes(), &broadcast_addr).await;
        time::sleep(Duration::from_secs(HEARTBEAT_INTERVAL_SECS)).await;
    }
}

async fn udp_listener_loop(devices: SharedDevices) {
    let socket = match TokioUdpSocket::bind(("0.0.0.0", BROADCAST_PORT)).await {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to bind to port {}: {}", BROADCAST_PORT, e);
            return;
        }
    };
    let mut buf = [0u8; 2048];
    loop {
        let Ok((len, addr)) = socket.recv_from(&mut buf).await else { continue; };
        let data = &buf[..len];
        let Ok(dev): Result<Device, _> = serde_json::from_slice(data) else {
            warn!("Failed to parse device data from {}: {:?}", addr, String::from_utf8_lossy(data));
            continue;
        };
        // Ignore own heartbeat
        match get_local_ip() {
            Some(local_ip) => {
                if dev.ip == local_ip {
                    continue;
                }
            }
            None => {
                warn!("Failed to get local IP");
            }
        }
        let now = Instant::now();
        let mut devs = devices.lock().unwrap();
        if let Some(existing) = devs.iter_mut().find(|d| d.device.ip == dev.ip) {
            existing.device = dev.clone();
            existing.last_seen_instant = now;
        } else {
            devs.push(DeviceEntry {
                device: dev.clone(),
                last_seen_instant: now,
            });
        }
    }
}

async fn cleanup_loop(devices: SharedDevices) {
    loop {
        {
            let mut devs = devices.lock().unwrap();
            let now = Instant::now();
            devs.retain(|entry| now.duration_since(entry.last_seen_instant).as_secs() < DEVICE_TIMEOUT_SECS);
        }
        time::sleep(Duration::from_secs(1)).await;
    }
}

#[tauri::command]
fn get_devices(devices: tauri::State<'_, SharedDevices>) -> Vec<Device> {
    let devs = devices.lock().unwrap();
    devs.iter().map(|entry| entry.device.clone()).collect()
}

#[tauri::command]
async fn send_file(app_handle: tauri::AppHandle, ip: String, port: u16, file_path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(file_path);
    match file_transfer::send_file(ip, port, path, app_handle).await {
        Ok(_) => Ok("File inviato con successo".into()),
        Err(e) => Err(e.to_string()),
    }
}

// Global state for tracking overall transfer progress
static OVERALL_SENT: once_cell::sync::Lazy<std::sync::Arc<tokio::sync::Mutex<u64>>> = 
    once_cell::sync::Lazy::new(|| std::sync::Arc::new(tokio::sync::Mutex::new(0)));

#[tauri::command]
async fn send_file_with_progress(
    app_handle: tauri::AppHandle, 
    ip: String, 
    port: u16, 
    path: String,
    file_index: Option<usize>,
    total_files: Option<usize>,
    file_name: Option<String>,
    total_size: Option<u64>
) -> Result<String, String> {
    let path_buf = std::path::PathBuf::from(path);
    
    // If this is the first file, reset the overall progress
    if let Some(index) = file_index {
        if index == 0 {
            let mut sent = OVERALL_SENT.lock().await;
            *sent = 0;
        }
    }
    
    match file_transfer::send_file_with_progress(ip, port, path_buf, app_handle, file_index, total_files, file_name, Some(OVERALL_SENT.clone()), total_size).await {
        Ok(_) => Ok("File inviato con successo".into()),
        Err(e) => Err(e.to_string()),
    }
}