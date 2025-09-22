use crate::updater::{UpdateManager, UpdaterConfig};
use crate::updater::platform_detector::PlatformDetector;

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

// State management
pub struct UpdaterState {
    pub manager: Arc<Mutex<UpdateManager>>,
}

impl UpdaterState {
    pub fn new(config: UpdaterConfig) -> Result<Self, String> {
        let manager = UpdateManager::new(config)
            .map_err(|e| format!("Failed to create update manager: {}", e))?;
        Ok(Self {
            manager: Arc::new(Mutex::new(manager)),
        })
    }
}

// Tauri commands - versione semplificata per ora
#[tauri::command]
pub async fn check_for_updates(
    state: State<'_, UpdaterState>,
) -> Result<String, String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare controllo aggiornamenti
    Ok("No updates available".to_string())
}

#[tauri::command]
pub async fn download_and_install_update(
    state: State<'_, UpdaterState>,
) -> Result<String, String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare download e installazione
    Ok("Update completed".to_string())
}

#[tauri::command]
pub async fn ignore_update_version(
    state: State<'_, UpdaterState>,
    version: String,
) -> Result<(), String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare ignorare versione
    println!("Ignoring version: {}", version);
    Ok(())
}

#[tauri::command]
pub async fn get_pending_changelog(
    state: State<'_, UpdaterState>,
) -> Result<Option<String>, String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare recupero changelog
    Ok(None)
}

#[tauri::command]
pub async fn mark_changelog_shown(
    state: State<'_, UpdaterState>,
) -> Result<(), String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare marcatura changelog come mostrato
    Ok(())
}

#[tauri::command]
pub async fn get_updater_state(
    state: State<'_, UpdaterState>,
) -> Result<String, String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare recupero stato
    Ok("idle".to_string())
}

#[tauri::command]
pub async fn get_updater_stats(
    state: State<'_, UpdaterState>,
) -> Result<String, String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare recupero statistiche
    Ok("{}".to_string())
}

#[tauri::command]
pub async fn reset_ignored_version(
    state: State<'_, UpdaterState>,
) -> Result<(), String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare reset versione ignorata
    Ok(())
}

#[tauri::command]
pub async fn get_platform_info() -> Result<String, String> {
    let platform = PlatformDetector::detect_current_platform()
        .map_err(|e| format!("Failed to detect platform: {}", e))?;
    Ok(format!("{:?}", platform))
}

#[tauri::command]
pub async fn test_github_connectivity(
    state: State<'_, UpdaterState>,
) -> Result<bool, String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare test connettività GitHub
    Ok(true)
}

#[tauri::command]
pub async fn cleanup_updater_data(
    state: State<'_, UpdaterState>,
) -> Result<(), String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare pulizia dati
    Ok(())
}

#[tauri::command]
pub async fn cancel_download(
    state: State<'_, UpdaterState>,
) -> Result<(), String> {
    let _manager = state.manager.lock().await;
    // TODO: Implementare cancellazione download
    Ok(())
}

#[tauri::command]
pub fn debug_test() -> String {
    "Debug command works!".to_string()
}