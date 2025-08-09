#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mdns::{discover::all, RecordKind};
use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::Manager;
use serde::Serialize;
use chrono::{Utc, DateTime};

#[derive(Clone, Debug, Serialize)]
struct Device {
    name: String,
    ip: String,
    port: u16,
    status: String,
    last_seen: String,
}

type SharedDevices = Arc<Mutex<Vec<Device>>>;

fn main() {
    let devices: SharedDevices = Arc::new(Mutex::new(Vec::new()));

    let devices_for_scan = devices.clone();

    thread::spawn(move || {
        mdns_scan_loop(devices_for_scan);
    });

    tauri::Builder::default()
        .manage(devices)
        .invoke_handler(tauri::generate_handler![get_devices])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}

fn mdns_scan_loop(devices: SharedDevices) {
    let service_name = "_airshare._tcp.local";

    let mut discovery = all(service_name)
        .expect("failed to start mdns discovery");

    println!("mdns scanning started...");

    while let Some(event) = discovery.next() {
        match event {
            Ok(response) => {
                let mut ip = None;
                let mut port = None;
                let mut name = None;

                for record in response.records() {
                    match &record.kind {
                        RecordKind::SRV { priority: _, weight: _, port: p, target } => {
                            port = Some(*p);
                            name = Some(target.to_string());
                        }
                        RecordKind::A(addr) => {
                            ip = Some(addr.to_string());
                        }
                        _ => {}
                    }
                }

                if let (Some(ip), Some(port), Some(name)) = (ip, port, name) {
                    let now: DateTime<Utc> = Utc::now();

                    let device = Device {
                        name,
                        ip,
                        port,
                        status: "Online".to_string(),
                        last_seen: now.to_rfc3339(),
                    };

                    let mut devs = devices.lock().unwrap();
                    if let Some(existing) = devs.iter_mut().find(|d| d.ip == device.ip) {
                        *existing = device.clone();
                    } else {
                        devs.push(device);
                    }
                }
            }
            Err(e) => eprintln!("mdns error: {:?}", e),
        }
    }
}

#[tauri::command]
fn get_devices(devices: tauri::State<'_, SharedDevices>) -> Vec<Device> {
    devices.lock().unwrap().clone()
}
