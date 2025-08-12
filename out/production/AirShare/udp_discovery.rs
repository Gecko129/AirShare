

//! UDP discovery module for device advertisement and discovery.
use std::{
    collections::HashMap,
    net::{SocketAddr, Ipv4Addr},
    sync::{Arc},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    net::UdpSocket,
    sync::Mutex,
    time,
    task,
};
use serde::{Serialize, Deserialize};
use log::{info, warn, error};

const BROADCAST_PORT: u16 = 42042;
const BROADCAST_ADDR: &str = "255.255.255.255";
const BROADCAST_INTERVAL_SECS: u64 = 5;
const CLEANUP_INTERVAL_SECS: u64 = 10;
const TIMEOUT_SECONDS: u64 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub last_seen: u64, // unix timestamp seconds
}

type DeviceMap = Arc<Mutex<HashMap<String, Device>>>;


pub struct DiscoveryManager {
    devices: DeviceMap,
}

impl DiscoveryManager {
    pub fn new() -> Self {
        DiscoveryManager {
            devices: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_discovery(&self, local_device: Device) {
        let devices = self.devices.clone();
        // Spawn listening task
        let listen_devices = devices.clone();
        let listen_task = task::spawn(async move {
            listen_loop(listen_devices).await;
        });

        // Spawn sending task
        let send_devices = devices.clone();
        let local_device_clone = local_device.clone();
        let send_task = task::spawn(async move {
            send_loop(local_device_clone).await;
        });

        // Spawn cleanup task
        let cleanup_devices = devices.clone();
        let cleanup_task = task::spawn(async move {
            cleanup_loop(cleanup_devices).await;
        });

        info!("UDP discovery started");
        // Await tasks in background (don't block here)
        // Optionally, join handles can be returned if desired.
        let _ = (listen_task, send_task, cleanup_task);
    }

    pub async fn get_active_devices(&self) -> Vec<Device> {
        let map = self.devices.lock().await;
        map.values().cloned().collect()
    }
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_secs()
}


async fn listen_loop(devices: DeviceMap) {
    let bind_addr = SocketAddr::from(([0, 0, 0, 0], BROADCAST_PORT));
    let socket = match UdpSocket::bind(bind_addr).await {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to bind UDP socket on {}: {}", bind_addr, e);
            return;
        }
    };
    // Allow broadcast packets
    if let Err(e) = socket.set_broadcast(true) {
        error!("Failed to set broadcast: {}", e);
    }
    let mut buf = [0u8; 2048];
    loop {
        let (len, src) = match socket.recv_from(&mut buf).await {
            Ok((len, src)) => (len, src),
            Err(e) => {
                error!("UDP recv_from error: {}", e);
                continue;
            }
        };
        let data = &buf[..len];
        let device: Result<Device, _> = serde_json::from_slice(data);
        match device {
            Ok(mut d) => {
                // Overwrite IP with sender's address
                d.ip = src.ip().to_string();
                d.last_seen = current_timestamp();
                let mut map = devices.lock().await;
                let key = d.id.clone();
                map.insert(key, d);
            }
            Err(e) => {
                let snippet = String::from_utf8_lossy(data);
                warn!("Failed to parse UDP device packet from {}: {}. Data: '{}'", src, e, snippet);
            }
        }
    }
}

async fn send_loop(local_device: Device) {
    let socket = match UdpSocket::bind("0.0.0.0:0").await {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to bind UDP socket for sending: {}", e);
            return;
        }
    };
    if let Err(e) = socket.set_broadcast(true) {
        error!("Failed to set broadcast on send socket: {}", e);
    }
    let broadcast_addr = format!("{}:{}", BROADCAST_ADDR, BROADCAST_PORT);
    let mut interval = time::interval(Duration::from_secs(BROADCAST_INTERVAL_SECS));
    loop {
        interval.tick().await;
        let mut device = local_device.clone();
        device.last_seen = current_timestamp();
        let payload = match serde_json::to_vec(&device) {
            Ok(p) => p,
            Err(e) => {
                error!("Failed to serialize device info: {}", e);
                continue;
            }
        };
        match socket.send_to(&payload, &broadcast_addr).await {
            Ok(_) => {}
            Err(e) => {
                warn!("Failed to send UDP broadcast: {}", e);
            }
        }
    }
}

async fn cleanup_loop(devices: DeviceMap) {
    let mut interval = time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));
    loop {
        interval.tick().await;
        let now = current_timestamp();
        let mut map = devices.lock().await;
        let before = map.len();
        map.retain(|_id, dev| now - dev.last_seen <= TIMEOUT_SECONDS);
        let after = map.len();
        if after < before {
            info!("Cleaned up {} stale device(s)", before - after);
        }
    }
}