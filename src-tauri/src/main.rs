#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    sync::{Arc, Mutex},
    net::SocketAddr,
    time::{Duration, Instant},
};

use tokio::time;
use tokio::net::UdpSocket as TokioUdpSocket;
use serde::{Serialize, Deserialize};
use chrono::Utc;
use log::{warn, error};
use hostname;

#[cfg(target_os = "windows")]
fn get_local_ip() -> Option<String> {
    use ipconfig;
    if let Ok(adapters) = ipconfig::get_adapters() {
        for adapter in adapters {
            for ip in adapter.ip_addresses() {
                if ip.is_ipv4() && !ip.is_loopback() {
                    return Some(ip.to_string());
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn get_local_ip() -> Option<String> {
    match local_ip_address::local_ip() {
        Ok(std::net::IpAddr::V4(ipv4)) if !ipv4.is_loopback() => Some(ipv4.to_string()),
        _ => None,
    }
}

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

#[tokio::main]
async fn main() {
    let devices: SharedDevices = Arc::new(Mutex::new(Vec::new()));
    let devices_for_listener = devices.clone();
    let devices_for_cleanup = devices.clone();

    tokio::spawn(async move {
        udp_broadcast_heartbeat_loop().await;
    });

    tokio::spawn(async move {
        udp_listener_loop(devices_for_listener).await;
    });

    tokio::spawn(async move {
        cleanup_loop(devices_for_cleanup).await;
    });

    tauri::Builder::default()
        .manage(devices)
        .invoke_handler(tauri::generate_handler![get_devices])
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
    let socket = TokioUdpSocket::bind(("0.0.0.0", 0))
        .await
        .expect("bind failed");
    socket.set_broadcast(true).expect("set broadcast failed");
    let broadcast_addr = SocketAddr::from(([255, 255, 255, 255], BROADCAST_PORT));

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
        let Ok((len, _addr)) = socket.recv_from(&mut buf).await else { continue; };
        let data = &buf[..len];
        let Ok(dev): Result<Device, _> = serde_json::from_slice(data) else {
            warn!("Failed to parse device data: {:?}", String::from_utf8_lossy(data));
            continue;
        };
        if let Some(local_ip) = get_local_ip() {
            if dev.ip == local_ip {
                continue;
            }
        } else {
            warn!("Failed to get local IP");
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
