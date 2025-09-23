// src-tauri/src/updater/commands.rs

use crate::updater::{
    types::*,
    github_api::GitHubClient,
    version_manager::VersionManager,
    platform_detector::{PlatformDetector, PlatformInfo},
    downloader::Downloader,
    installer::Installer,
    storage::{StorageManager, UpdateStats, CleanupResult},
};
use tauri::{Window, Emitter};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;

// Stato globale condiviso tra i comandi
lazy_static::lazy_static! {
    static ref UPDATER_STATE: Arc<Mutex<UpdateState>> = Arc::new(Mutex::new(UpdateState::Idle));
    static ref ACTIVE_DOWNLOADS: Arc<Mutex<HashMap<String, bool>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// Comando di debug per test
#[tauri::command]
pub async fn debug_test() -> Result<String, String> {
    Ok("Debug test successful".to_string())
}

/// Controlla se ci sono aggiornamenti disponibili
#[tauri::command]
pub async fn check_for_updates(window: Window) -> Result<Option<UpdateInfo>, String> {
    let mut state_lock = UPDATER_STATE.lock().await;
    
    // Evita controlli multipli simultanei
    if matches!(*state_lock, UpdateState::Checking) {
        return Err("Update check already in progress".to_string());
    }
    
    *state_lock = UpdateState::Checking;
    drop(state_lock); // Rilascia il lock per permettere aggiornamenti di stato
    
    // Emetti evento di inizio controllo
    let _ = window.emit("updater-state-changed", UpdateState::Checking);
    
    let result = perform_update_check(&window).await;
    
    // Aggiorna lo stato finale
    let mut state_lock = UPDATER_STATE.lock().await;
    match &result {
        Ok(Some(update_info)) => {
            *state_lock = UpdateState::UpdateAvailable(update_info.clone());
        },
        Ok(None) => {
            *state_lock = UpdateState::Idle;
        },
        Err(e) => {
            *state_lock = UpdateState::Error(e.clone());
        }
    }
    
    let final_state = state_lock.clone();
    drop(state_lock);
    
    // Emetti evento di stato finale
    let _ = window.emit("updater-state-changed", final_state);
    
    result
}

/// Esegue il controllo effettivo degli aggiornamenti
async fn perform_update_check(_window: &Window) -> Result<Option<UpdateInfo>, String> {
    // Inizializza componenti
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    let github_client = GitHubClient::new("Gecko129".to_string(), "AirShare".to_string());
    
    // Carica stato attuale
    let current_state = storage.load_state().await.map_err(|e| format!("Failed to load state: {}", e))?;
    let current_version = &current_state.current_version;
    
    println!("Checking for updates. Current version: {}", current_version);
    
    // Ottieni ultima release da GitHub
    let latest_release = github_client.get_latest_release().await
        .map_err(|e| format!("GitHub API error: {}", e))?;
    
    println!("Latest release found: {} ({})", latest_release.tag_name, latest_release.name);
    
    // Controlla se dovremmo offrire l'aggiornamento
    let should_update = VersionManager::should_offer_update(
        current_version,
        &latest_release,
        &current_state,
    ).map_err(|e| format!("Version comparison error: {}", e))?;
    
    if !should_update {
        println!("No update needed or update was previously ignored");
        
        // Aggiorna la versione controllata nel storage
        storage.update_checked_version(latest_release.tag_name.clone()).await
            .map_err(|e| format!("Failed to update storage: {}", e))?;
        
        return Ok(None);
    }
    
    // Rileva la piattaforma e trova l'asset compatibile
    let current_platform = PlatformDetector::detect_current_platform()
        .map_err(|e| format!("Platform detection error: {}", e))?;
    
    let compatible_asset = PlatformDetector::select_asset_for_platform(current_platform, &latest_release.assets)
        .map_err(|e| format!("No compatible asset found: {}", e))?;
    
    // Estrai changelog pulito
    let changelog = github_client.extract_changelog(&latest_release);
    
    let update_info = UpdateInfo {
        current_version: current_version.clone(),
        new_version: latest_release.tag_name.clone(),
        release_name: latest_release.name,
        changelog,
        published_at: latest_release.published_at,
        is_prerelease: latest_release.prerelease,
        download_asset: compatible_asset,
    };
    
    // Aggiorna storage con l'ultima versione controllata
    storage.update_checked_version(latest_release.tag_name).await
        .map_err(|e| format!("Failed to update storage: {}", e))?;
    
    println!("Update available: {} -> {}", current_version, update_info.new_version);
    Ok(Some(update_info))
}

/// Scarica e installa l'aggiornamento
#[tauri::command]
pub async fn download_and_install_update(window: Window) -> Result<(), String> {
    let mut state_lock = UPDATER_STATE.lock().await;
    
    // Verifica che ci sia un aggiornamento disponibile
    let update_info = match state_lock.clone() {
        UpdateState::UpdateAvailable(info) => info,
        _ => return Err("No update available".to_string()),
    };
    
    *state_lock = UpdateState::Downloading { progress: 0.0, total_size: update_info.download_asset.size, downloaded: 0 };
    drop(state_lock);
    
    // Emetti evento di inizio download
    let _ = window.emit("updater-state-changed", UpdateState::Downloading { 
        progress: 0.0, 
        total_size: update_info.download_asset.size, 
        downloaded: 0 
    });
    
    let result = perform_download_and_install(&window, &update_info).await;
    
    // Aggiorna stato finale
    let mut state_lock = UPDATER_STATE.lock().await;
    match &result {
        Ok(_) => {
            *state_lock = UpdateState::Completed(update_info.new_version.clone());
        },
        Err(e) => {
            *state_lock = UpdateState::Error(e.clone());
        }
    }
    
    let final_state = state_lock.clone();
    drop(state_lock);
    
    let _ = window.emit("updater-state-changed", final_state);
    
    result
}

/// Esegue download e installazione effettivi
async fn perform_download_and_install(window: &Window, update_info: &UpdateInfo) -> Result<(), String> {
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    let downloader = Downloader::new().map_err(|e| format!("Downloader error: {}", e))?;
    let installer = Installer::new().map_err(|e| format!("Installer error: {}", e))?;
    
    // Determina path per il download
    let download_dir = std::env::temp_dir().join("airshare_updates");
    tokio::fs::create_dir_all(&download_dir).await
        .map_err(|e| format!("Cannot create download directory: {}", e))?;
    
    let downloaded_file = download_dir.join(&update_info.download_asset.name);
    
    println!("Downloading update to: {:?}", downloaded_file);
    
    // Clona window per il callback del progress
    let progress_window = window.clone();
    
    // Download con progress callback
    let downloaded_info = downloader.download_file(
        &update_info.download_asset.browser_download_url,
        &downloaded_file,
        move |progress| -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            // Aggiorna stato globale
            let window_clone = progress_window.clone();
            tokio::spawn(async move {
                let mut state_lock = UPDATER_STATE.lock().await;
                *state_lock = UpdateState::Downloading { 
                    progress: progress.percentage, 
                    total_size: progress.total_size, 
                    downloaded: progress.downloaded 
                };
                let state = state_lock.clone();
                drop(state_lock);
                
                // Emetti evento di progress
                let _ = window_clone.emit("updater-state-changed", state);
                let _ = window_clone.emit("download-progress", progress);
            });
            
            Ok(())
        },
    ).await.map_err(|e| format!("Download failed: {}", e))?;
    
    println!("Download completed: {}", downloaded_info.format_stats());
    
    // Aggiorna stato a installazione
    {
        let mut state_lock = UPDATER_STATE.lock().await;
        *state_lock = UpdateState::Installing;
    }
    let _ = window.emit("updater-state-changed", UpdateState::Installing);
    
    // Installa l'aggiornamento
    let installation_result = installer.install_update(&downloaded_file).await
        .map_err(|e| format!("Installation failed: {}", e))?;
    
    println!("Installation completed: {}", installation_result.format_info());
    
    // Imposta changelog per il prossimo avvio
    storage.set_changelog_pending(update_info.new_version.clone()).await
        .map_err(|e| format!("Failed to set changelog: {}", e))?;
    
    // Cleanup file scaricato
    let _ = installer.cleanup_installation_files(&[downloaded_file]).await;
    
    // Programma riavvio dell'app
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        let _ = installer.restart_application().await;
    });
    
    Ok(())
}

/// Ignora la versione di aggiornamento corrente
#[tauri::command]
pub async fn ignore_update_version(version: String) -> Result<(), String> {
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    
    storage.mark_version_ignored(version.clone()).await
        .map_err(|e| format!("Failed to mark version as ignored: {}", e))?;
    
    // Resetta stato a idle
    {
        let mut state_lock = UPDATER_STATE.lock().await;
        *state_lock = UpdateState::Idle;
    }
    
    println!("Ignored update version: {}", version);
    Ok(())
}

/// Ottiene changelog se ce n'è uno da mostrare
#[tauri::command]
pub async fn get_pending_changelog() -> Result<Option<ChangelogInfo>, String> {
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    let state = storage.load_state().await.map_err(|e| format!("Failed to load state: {}", e))?;
    
    if let Some(version) = &state.show_changelog_for {
        // Cerca di ottenere il changelog dalla GitHub API
        let github_client = GitHubClient::new("Gecko129".to_string(), "AirShare".to_string());
        
        // Per ora, otteniamo la release più recente e verifichiamo se è quella giusta
        match github_client.get_latest_release().await {
            Ok(release) if release.tag_name == *version => {
                let changelog = github_client.extract_changelog(&release);
                Ok(Some(ChangelogInfo {
                    version: version.clone(),
                    release_name: release.name,
                    changelog,
                    published_at: release.published_at,
                }))
            },
            _ => {
                // Se non riusciamo a ottenere il changelog, rimuoviamo il flag
                storage.mark_changelog_shown(version.clone()).await.ok();
                Ok(None)
            }
        }
    } else {
        Ok(None)
    }
}

/// Segna il changelog come mostrato
#[tauri::command]
pub async fn mark_changelog_shown(version: String) -> Result<(), String> {
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    
    storage.mark_changelog_shown(version).await
        .map_err(|e| format!("Failed to mark changelog as shown: {}", e))?;
    
    Ok(())
}

/// Ottiene lo stato corrente dell'updater
#[tauri::command]
pub async fn get_updater_state() -> Result<UpdateState, String> {
    let state_lock = UPDATER_STATE.lock().await;
    Ok(state_lock.clone())
}

/// Ottiene statistiche degli aggiornamenti
#[tauri::command]
pub async fn get_updater_stats() -> Result<UpdateStats, String> {
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    
    storage.get_stats().await
        .map_err(|e| format!("Failed to get stats: {}", e))
}

/// Resetta la versione ignorata (per forzare un nuovo controllo)
#[tauri::command]
pub async fn reset_ignored_version() -> Result<(), String> {
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    
    storage.reset_ignored_version().await
        .map_err(|e| format!("Failed to reset ignored version: {}", e))?;
    
    // Resetta anche lo stato
    {
        let mut state_lock = UPDATER_STATE.lock().await;
        *state_lock = UpdateState::Idle;
    }
    
    Ok(())
}

/// Ottiene informazioni sulla piattaforma corrente
#[tauri::command]
pub async fn get_platform_info() -> Result<PlatformInfo, String> {
    Ok(PlatformDetector::get_platform_info())
}

/// Testa la connettività con GitHub
#[tauri::command]
pub async fn test_github_connectivity() -> Result<bool, String> {
    let github_client = GitHubClient::new("Gecko129".to_string(), "AirShare".to_string());
    
    github_client.test_connection().await
        .map_err(|e| format!("Connectivity test failed: {}", e))
}

/// Pulisce file vecchi dell'updater
#[tauri::command]
pub async fn cleanup_updater_data(max_age_days: u64) -> Result<CleanupResult, String> {
    let storage = StorageManager::new().map_err(|e| format!("Storage error: {}", e))?;
    
    storage.cleanup_old_data(max_age_days).await
        .map_err(|e| format!("Cleanup failed: {}", e))
}

/// Annulla un download in corso (se possibile)
#[tauri::command]
pub async fn cancel_download(window: Window) -> Result<(), String> {
    let mut downloads_lock = ACTIVE_DOWNLOADS.lock().await;
    downloads_lock.insert("current".to_string(), false); // Flag per cancellazione
    drop(downloads_lock);
    
    // Aggiorna stato
    {
        let mut state_lock = UPDATER_STATE.lock().await;
        *state_lock = UpdateState::Idle;
    }
    
    let _ = window.emit("updater-state-changed", UpdateState::Idle);
    Ok(())
}

/// Informazioni di changelog da mostrare
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChangelogInfo {
    pub version: String,
    pub release_name: String,
    pub changelog: String,
    pub published_at: String,
}


#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_updater_state_management() {
        // Testa che lo stato iniziale sia Idle
        let state = get_updater_state().await.unwrap();
        assert!(matches!(state, UpdateState::Idle));
    }

    #[tokio::test]
    async fn test_platform_info() {
        let info = get_platform_info().await.unwrap();
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
    }

    #[tokio::test]
    async fn test_ignore_version() {
        let result = ignore_update_version("v1.2.3-test".to_string()).await;
        assert!(result.is_ok());
        
        // Lo stato dovrebbe essere resettato a Idle
        let state = get_updater_state().await.unwrap();
        assert!(matches!(state, UpdateState::Idle));
    }

    #[tokio::test]
    async fn test_stats() {
        let stats = get_updater_stats().await;
        assert!(stats.is_ok());
        
        let stats = stats.unwrap();
        assert!(!stats.current_version.is_empty());
    }

    #[tokio::test]
    async fn test_cleanup() {
        let result = cleanup_updater_data(30).await;
        assert!(result.is_ok());
        
        let _cleanup_result = result.unwrap();
        // files_removed e bytes_freed possono essere 0 se non ci sono file da pulire
        // assert!(cleanup_result.files_removed >= 0); // u32 è sempre >= 0
    }
}