#![allow(unused_imports)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;

mod file_transfer;
use crate::file_transfer::{list_trusted_devices};

use std::{
    sync::{Arc, Mutex},
    net::{SocketAddr},
    time::{Duration, Instant},
};
use tokio::time;
use tokio::net::UdpSocket as TokioUdpSocket;
use serde::{Serialize, Deserialize};
use chrono::Utc;
use log::{warn, error, debug};
use get_if_addrs::get_if_addrs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use std::path::Path;
use tauri::Emitter;
use mac_address::get_mac_address;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Device {
    name: String,
    ip: String,
    port: u16,
    status: String,
    last_seen: String,
    #[serde(default)]
    mac: Option<String>,
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

// ✅ AGGIUNTA: Funzione per normalizzare il nome del dispositivo
fn normalize_device_name(hostname: &str) -> String {
    if hostname.is_empty() || hostname == "Unknown" {
        return "Dispositivo".to_string();
    }
    
    let lower = hostname.to_lowercase();
    
    // Se contiene informazioni di tipo, mantienilo
    if lower.contains("iphone") || lower.contains("ipad") || lower.contains("ios") {
        return hostname.to_string();
    }
    if lower.contains("android") {
        return hostname.to_string();
    }
    if lower.contains("mac") || lower.contains("macbook") || lower.contains("darwin") {
        return hostname.to_string();
    }
    if lower.contains("win") || lower.contains("windows") {
        return hostname.to_string();
    }
    if lower.contains("linux") {
        return hostname.to_string();
    }
    
    // Altrimenti, se è un nome generico, aggiungi il tipo di device rilevabile
    #[cfg(target_os = "macos")]
    {
        if !lower.contains("mac") && !lower.contains("macbook") {
            return format!("{} (macOS)", hostname);
        }
    }
    #[cfg(target_os = "windows")]
    {
        if !lower.contains("win") && !lower.contains("windows") {
            return format!("{} (Windows)", hostname);
        }
    }
    #[cfg(target_os = "linux")]
    {
        if !lower.contains("linux") {
            return format!("{} (Linux)", hostname);
        }
    }
    
    hostname.to_string()
}

use tauri_plugin_dialog;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
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
        .invoke_handler(tauri::generate_handler![
            get_devices,
            send_file,
            send_file_with_progress,
            file_transfer::get_file_info,
            file_transfer::respond_transfer,
            file_transfer::add_recent_transfer,
            file_transfer::get_recent_transfers,
            file_transfer::delete_recent_transfer,
            file_transfer::get_auto_accept_trusted,
            file_transfer::set_auto_accept_trusted,
            file_transfer::list_trusted_devices,
            file_transfer::get_system_stats,
            file_transfer::get_today_stats,
            file_transfer::add_trusted_device_mac,
            file_transfer::remove_trusted_device_mac,
            file_transfer::cancel_transfer_send,
            file_transfer::cancel_transfer_receive
         ])
        .run(tauri::generate_context!())
        .expect("error running tauri app");

    Ok(())
}

// ✅ MODIFICATA: Funzione per inviare heartbeat con nome normalizzato
async fn udp_broadcast_heartbeat_loop() {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());
    
    // ✅ Normalizza il nome del dispositivo
    let name = normalize_device_name(&hostname);
    
    let port = BROADCAST_PORT;
    let ip = get_local_ip().unwrap_or_else(|| "0.0.0.0".to_string());
    
    // get local MAC (optional)
    let mac = match get_mac_address() {
        Ok(Some(ma)) => Some(format!("{}", ma).to_lowercase()),
        _ => None,
    };

    let device = Device {
        name: name.clone(),  // ✅ Usa il nome normalizzato
        ip: ip.clone(),
        port,
        status: "Online".to_string(),
        last_seen: Utc::now().to_rfc3339(),
        mac: mac.clone(),
    };
    
    let socket = TokioUdpSocket::bind(("0.0.0.0", 0)).await.expect("bind failed");
    socket.set_broadcast(true).expect("set broadcast failed");
    let broadcast_addr = SocketAddr::from(([255,255,255,255], BROADCAST_PORT));
    
    debug!("[BROADCAST] Avvio heartbeat con nome normalizzato: {}", name);
    
    loop {
        let mut to_send = device.clone();
        to_send.last_seen = Utc::now().to_rfc3339();
        
        // ✅ Log per debug
        debug!("[BROADCAST] Invio heartbeat: name={}, ip={}, port={}", to_send.name, to_send.ip, to_send.port);
        
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
        
        debug!("[LISTENER] Ricevuto dispositivo: name={}, ip={}", dev.name, dev.ip);
        
        let now = Instant::now();
        let mut devs = devices.lock().unwrap();
        if let Some(existing) = devs.iter_mut().find(|d| d.device.ip == dev.ip) {
            existing.device = dev.clone();
            existing.last_seen_instant = now;
            debug!("[LISTENER] Dispositivo aggiornato: {}", dev.name);
        } else {
            devs.push(DeviceEntry {
                device: dev.clone(),
                last_seen_instant: now,
            });
            debug!("[LISTENER] Nuovo dispositivo aggiunto: {}", dev.name);
        }
    }
}

async fn cleanup_loop(devices: SharedDevices) {
    loop {
        {
            let mut devs = devices.lock().unwrap();
            let now = Instant::now();
            let before_count = devs.len();
            devs.retain(|entry| now.duration_since(entry.last_seen_instant).as_secs() < DEVICE_TIMEOUT_SECS);
            let after_count = devs.len();
            
            if before_count != after_count {
                debug!("[CLEANUP] Rimossi {} dispositivi inattivi", before_count - after_count);
            }
        }
        time::sleep(Duration::from_secs(1)).await;
    }
}

#[tauri::command]
fn get_devices(devices: tauri::State<'_, SharedDevices>) -> Vec<Device> {
    let devs = devices.lock().unwrap();
    let device_list: Vec<Device> = devs.iter().map(|entry| entry.device.clone()).collect();
    
    debug!("[GET_DEVICES] Ritornando {} dispositivi", device_list.len());
    for device in &device_list {
        debug!("[GET_DEVICES] - {}: {}", device.name, device.ip);
    }
    
    device_list
}

#[tauri::command]
async fn send_file(app_handle: tauri::AppHandle, ip: String, port: u16, file_path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(file_path);
    match file_transfer::send_file(ip, port, path, app_handle, None).await {
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
    total_size: Option<u64>,
    batch_id: String
) -> Result<String, String> {
    let path_buf = std::path::PathBuf::from(&path);
    
    // Log dettagliato di tutti i parametri ricevuti
    log::info!("[MAIN] Parametri ricevuti dal frontend:");
    log::info!("[MAIN] - ip: {}", ip);
    log::info!("[MAIN] - port: {}", port);
    log::info!("[MAIN] - path: {}", path);
    log::info!("[MAIN] - file_index: {:?}", file_index);
    log::info!("[MAIN] - total_files: {:?}", total_files);
    log::info!("[MAIN] - file_name: {:?}", file_name);
    log::info!("[MAIN] - total_size: {:?}", total_size);
    log::info!("[MAIN] - batch_id: {:?}", batch_id);
    
    // Log del batch_id ricevuto dal frontend
    if !batch_id.is_empty() {
        log::info!("[MAIN] ✅ Ricevuto batch_id dal frontend: {}", batch_id);
        log::info!("[MAIN] Invio file {} con batch_id: {}", path, batch_id);
    } else {
        log::warn!("[MAIN] ❌ Nessun batch_id ricevuto dal frontend per il file: {}", path);
        log::warn!("[MAIN] Il parametro batch_id è vuoto");
    }
    
    // If this is the first file, reset the overall progress
    if let Some(index) = file_index {
        if index == 0 {
            let mut sent = OVERALL_SENT.lock().await;
            *sent = 0;
        }
    }
    
    let batch_id_option = if batch_id.is_empty() { None } else { Some(batch_id) };
    match file_transfer::send_file_with_progress(ip, port, path_buf, app_handle, file_index, total_files, file_name, Some(OVERALL_SENT.clone()), total_size, batch_id_option).await {
        Ok(_) => Ok("File inviato con successo".into()),
        Err(e) => Err(e.to_string()),
    }
}

