// src-tauri/src/updater/mod.rs

pub mod types;
pub mod github_api;
pub mod version_manager;
pub mod platform_detector;
pub mod downloader;
pub mod installer;
pub mod storage;
pub mod commands;

// Re-export principali types per facilità d'uso
pub use types::*;

// Re-export degli errori (comentati per ora per evitare warning)
// pub use github_api::GitHubError;
// pub use downloader::DownloadError;
// pub use installer::InstallerError;
// pub use storage::StorageError;
// pub use version_manager::VersionError;

// Inizializzazione del sistema di aggiornamento
use crate::updater::storage::StorageManager;
use crate::updater::github_api::GitHubClient;

pub struct UpdaterConfig {
    pub repo_owner: String,
    pub repo_name: String,
    pub current_version: String,
}

impl Default for UpdaterConfig {
    fn default() -> Self {
        Self {
            repo_owner: "Gecko129".to_string(),
            repo_name: "AirShare".to_string(),
            current_version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

// Manager principale per coordinare tutti i componenti
#[allow(dead_code)]
pub struct UpdateManager {
    pub config: UpdaterConfig,
    pub github_client: GitHubClient,
    pub storage: StorageManager,
}

impl UpdateManager {
    pub fn new(config: UpdaterConfig) -> Result<Self, Box<dyn std::error::Error>> {
        let github_client = GitHubClient::new(
            config.repo_owner.clone(),
            config.repo_name.clone(),
        );
        
        let storage = StorageManager::new()?;
        
        Ok(Self {
            config,
            github_client,
            storage,
        })
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Crea directory storage se non esiste
        self.storage.ensure_storage_dir().await?;
        
        // Carica o crea stato iniziale
        let mut state = self.storage.load_state().await.unwrap_or_else(|_| {
            UpdateStorage {
                current_version: self.config.current_version.clone(),
                last_checked_version: None,
                last_ignored_version: None,
                show_changelog_for: None,
                last_check_timestamp: 0,
            }
        });
        
        // Aggiorna versione corrente se è cambiata
        if state.current_version != self.config.current_version {
            state.current_version = self.config.current_version.clone();
            self.storage.save_state(&state).await?;
        }
        
        Ok(())
    }
}

// Test per verificare che tutti i moduli si compilino
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = UpdaterConfig::default();
        assert_eq!(config.repo_owner, "Gecko129");
        assert_eq!(config.repo_name, "AirShare");
        assert!(!config.current_version.is_empty());
    }

    #[tokio::test]
    async fn test_manager_creation() {
        let config = UpdaterConfig::default();
        let manager = UpdateManager::new(config);
        assert!(manager.is_ok());
    }
}