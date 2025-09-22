// src-tauri/src/updater/storage.rs

use crate::updater::types::{UpdateStorage, UpdateConfig};
use serde_json;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use tokio::fs;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum StorageError {
    #[error("File system error: {0}")]
    FileSystemError(#[from] std::io::Error),
    
    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),
    
    #[error("Invalid data directory")]
    InvalidDataDirectory,
    
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    
    #[error("Storage corruption: {0}")]
    CorruptedData(String),
}

/// Manager per la persistenza dello stato degli aggiornamenti
#[allow(dead_code)]
pub struct StorageManager {
    storage_dir: PathBuf,
    state_file: PathBuf,
    config_file: PathBuf,
}

#[allow(dead_code)]
impl StorageManager {
    /// Crea nuovo storage manager
    pub fn new() -> Result<Self, StorageError> {
        let storage_dir = Self::get_storage_directory()?;
        let state_file = storage_dir.join("updater_state.json");
        let config_file = storage_dir.join("updater_config.json");

        Ok(Self {
            storage_dir,
            state_file,
            config_file,
        })
    }

    /// Crea un nuovo storage manager con directory personalizzata
    pub fn with_custom_directory(custom_dir: PathBuf) -> Result<Self, StorageError> {
        let state_file = custom_dir.join("updater_state.json");
        let config_file = custom_dir.join("updater_config.json");

        Ok(Self {
            storage_dir: custom_dir,
            state_file,
            config_file,
        })
    }

    /// Assicura che la directory di storage esista
    pub async fn ensure_storage_dir(&self) -> Result<(), StorageError> {
        if !self.storage_dir.exists() {
            fs::create_dir_all(&self.storage_dir).await?;
            println!("Created storage directory: {:?}", self.storage_dir);
        }
        Ok(())
    }

    /// Carica lo stato degli aggiornamenti
    pub async fn load_state(&self) -> Result<UpdateStorage, StorageError> {
        if !self.state_file.exists() {
            // Se il file non esiste, restituisci stato di default
            return Ok(UpdateStorage::default());
        }

        let content = fs::read_to_string(&self.state_file).await?;
        
        // Prova a parsare il JSON
        match serde_json::from_str::<UpdateStorage>(&content) {
            Ok(state) => {
                // Valida i dati caricati
                self.validate_state(&state)?;
                Ok(state)
            },
            Err(e) => {
                println!("Warning: Failed to parse state file, using defaults: {}", e);
                // In caso di errore, usa default e backup il file corrotto
                self.backup_corrupted_file(&self.state_file).await?;
                Ok(UpdateStorage::default())
            }
        }
    }

    /// Salva lo stato degli aggiornamenti
    pub async fn save_state(&self, state: &UpdateStorage) -> Result<(), StorageError> {
        self.ensure_storage_dir().await?;

        // Aggiorna timestamp
        let mut updated_state = state.clone();
        updated_state.last_check_timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Serializza in JSON con pretty printing
        let content = serde_json::to_string_pretty(&updated_state)?;

        // Scrivi atomicamente usando un file temporaneo
        let temp_file = self.state_file.with_extension("tmp");
        fs::write(&temp_file, content).await?;
        fs::rename(&temp_file, &self.state_file).await?;

        println!("Saved updater state to: {:?}", self.state_file);
        Ok(())
    }

    /// Carica la configurazione degli aggiornamenti
    pub async fn load_config(&self) -> Result<UpdateConfig, StorageError> {
        if !self.config_file.exists() {
            // Se il file non esiste, crea e salva configurazione di default
            let default_config = UpdateConfig::default();
            self.save_config(&default_config).await?;
            return Ok(default_config);
        }

        let content = fs::read_to_string(&self.config_file).await?;
        
        match serde_json::from_str::<UpdateConfig>(&content) {
            Ok(config) => Ok(config),
            Err(e) => {
                println!("Warning: Failed to parse config file, using defaults: {}", e);
                self.backup_corrupted_file(&self.config_file).await?;
                let default_config = UpdateConfig::default();
                self.save_config(&default_config).await?;
                Ok(default_config)
            }
        }
    }

    /// Salva la configurazione degli aggiornamenti
    pub async fn save_config(&self, config: &UpdateConfig) -> Result<(), StorageError> {
        self.ensure_storage_dir().await?;

        let content = serde_json::to_string_pretty(config)?;
        
        let temp_file = self.config_file.with_extension("tmp");
        fs::write(&temp_file, content).await?;
        fs::rename(&temp_file, &self.config_file).await?;

        println!("Saved updater config to: {:?}", self.config_file);
        Ok(())
    }

    /// Segna una versione come ignorata
    pub async fn mark_version_ignored(&self, version: String) -> Result<(), StorageError> {
        let mut state = self.load_state().await?;
        state.last_ignored_version = Some(version);
        self.save_state(&state).await
    }

    /// Imposta la versione per cui mostrare il changelog
    pub async fn set_changelog_pending(&self, version: String) -> Result<(), StorageError> {
        let mut state = self.load_state().await?;
        state.show_changelog_for = Some(version);
        self.save_state(&state).await
    }

    /// Segna il changelog come mostrato
    pub async fn mark_changelog_shown(&self, version: String) -> Result<(), StorageError> {
        let mut state = self.load_state().await?;
        
        // Rimuovi solo se è la versione corrente
        if state.show_changelog_for.as_ref() == Some(&version) {
            state.show_changelog_for = None;
            self.save_state(&state).await?;
        }
        
        Ok(())
    }

    /// Aggiorna la versione controllata
    pub async fn update_checked_version(&self, version: String) -> Result<(), StorageError> {
        let mut state = self.load_state().await?;
        state.last_checked_version = Some(version);
        self.save_state(&state).await
    }

    /// Resetta lo stato ignorato (per forzare ricontrollo)
    pub async fn reset_ignored_version(&self) -> Result<(), StorageError> {
        let mut state = self.load_state().await?;
        state.last_ignored_version = None;
        self.save_state(&state).await
    }

    /// Ottiene statistiche sui controlli
    pub async fn get_stats(&self) -> Result<UpdateStats, StorageError> {
        let state = self.load_state().await?;
        let config = self.load_config().await?;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let time_since_last_check = if state.last_check_timestamp > 0 {
            Some(now.saturating_sub(state.last_check_timestamp))
        } else {
            None
        };

        let next_check_due = if let Some(last_check) = time_since_last_check {
            last_check >= config.check_interval_seconds
        } else {
            true // Mai controllato, check subito
        };

        Ok(UpdateStats {
            last_check_timestamp: state.last_check_timestamp,
            time_since_last_check,
            next_check_due,
            has_ignored_version: state.last_ignored_version.is_some(),
            has_pending_changelog: state.show_changelog_for.is_some(),
            current_version: state.current_version,
            config: config,
        })
    }

    /// Pulisce dati vecchi
    pub async fn cleanup_old_data(&self, max_age_days: u64) -> Result<CleanupResult, StorageError> {
        let mut cleaned_files = 0;
        let mut freed_bytes = 0u64;

        // Cerca backup vecchi nella directory
        let max_age_secs = max_age_days * 24 * 3600;
        let cutoff_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .saturating_sub(max_age_secs);

        if self.storage_dir.exists() {
            let mut dir = fs::read_dir(&self.storage_dir).await?;
            
            while let Some(entry) = dir.next_entry().await? {
                let path = entry.path();
                let metadata = entry.metadata().await?;
                
                // Controlla solo file di backup o temporanei
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("backup_") || name.ends_with(".bak") || name.ends_with(".tmp") {
                        if let Ok(modified) = metadata.modified() {
                            if let Ok(modified_secs) = modified.duration_since(UNIX_EPOCH) {
                                if modified_secs.as_secs() < cutoff_time {
                                    freed_bytes += metadata.len();
                                    if fs::remove_file(&path).await.is_ok() {
                                        cleaned_files += 1;
                                        println!("Cleaned old file: {:?}", path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(CleanupResult {
            files_removed: cleaned_files,
            bytes_freed: freed_bytes,
        })
    }

    /// Esegue backup del file corrotto
    async fn backup_corrupted_file(&self, corrupted_file: &Path) -> Result<(), StorageError> {
        let backup_name = format!("{}.corrupted.{}", 
            corrupted_file.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown"),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        
        let backup_path = self.storage_dir.join(backup_name);
        
        if let Err(e) = fs::rename(corrupted_file, &backup_path).await {
            println!("Warning: Failed to backup corrupted file: {}", e);
        } else {
            println!("Backed up corrupted file to: {:?}", backup_path);
        }
        
        Ok(())
    }

    /// Valida i dati dello stato
    fn validate_state(&self, state: &UpdateStorage) -> Result<(), StorageError> {
        // Controlla che la versione corrente sia un formato valido
        if state.current_version.is_empty() {
            return Err(StorageError::CorruptedData("Empty current version".to_string()));
        }

        // Controlla timestamp ragionevoli
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        if state.last_check_timestamp > now + 86400 { // Non più di 1 giorno nel futuro
            return Err(StorageError::CorruptedData("Invalid timestamp in future".to_string()));
        }

        Ok(())
    }

    /// Ottiene la directory di storage
    fn get_storage_directory() -> Result<PathBuf, StorageError> {
        let base_dir = dirs::data_dir()
            .or_else(|| dirs::config_dir())
            .or_else(|| dirs::home_dir().map(|h| h.join(".config")))
            .ok_or(StorageError::InvalidDataDirectory)?;

        Ok(base_dir.join("AirShare").join("updater"))
    }

    /// Path dei file
    pub fn state_file_path(&self) -> &Path {
        &self.state_file
    }

    pub fn config_file_path(&self) -> &Path {
        &self.config_file
    }

    pub fn storage_directory(&self) -> &Path {
        &self.storage_dir
    }
}

/// Statistiche sui controlli degli aggiornamenti
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct UpdateStats {
    pub last_check_timestamp: u64,
    pub time_since_last_check: Option<u64>, // secondi
    pub next_check_due: bool,
    pub has_ignored_version: bool,
    pub has_pending_changelog: bool,
    pub current_version: String,
    pub config: UpdateConfig,
}

#[allow(dead_code)]
impl UpdateStats {
    /// Formatta il tempo dall'ultimo controllo
    pub fn format_time_since_check(&self) -> String {
        match self.time_since_last_check {
            Some(secs) if secs < 60 => format!("{} seconds ago", secs),
            Some(secs) if secs < 3600 => format!("{} minutes ago", secs / 60),
            Some(secs) if secs < 86400 => format!("{} hours ago", secs / 3600),
            Some(secs) => format!("{} days ago", secs / 86400),
            None => "Never".to_string(),
        }
    }

    /// Tempo fino al prossimo controllo programmato
    pub fn time_until_next_check(&self) -> Option<u64> {
        if self.next_check_due {
            return Some(0);
        }

        self.time_since_last_check.map(|elapsed| {
            self.config.check_interval_seconds.saturating_sub(elapsed)
        })
    }
}

/// Risultato della pulizia dei file vecchi
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CleanupResult {
    pub files_removed: u32,
    pub bytes_freed: u64,
}

#[allow(dead_code)]
impl CleanupResult {
    pub fn format_result(&self) -> String {
        format!(
            "Cleaned {} files, freed {}",
            self.files_removed,
            Self::format_bytes(self.bytes_freed)
        )
    }

    fn format_bytes(bytes: u64) -> String {
        if bytes >= 1_000_000_000 {
            format!("{:.1} GB", bytes as f64 / 1_000_000_000.0)
        } else if bytes >= 1_000_000 {
            format!("{:.1} MB", bytes as f64 / 1_000_000.0)
        } else if bytes >= 1_000 {
            format!("{:.1} KB", bytes as f64 / 1_000.0)
        } else {
            format!("{} B", bytes)
        }
    }
}

impl Default for StorageManager {
    fn default() -> Self {
        Self::new().expect("Failed to create default storage manager")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    async fn create_test_storage() -> StorageManager {
        let temp_dir = tempdir().unwrap();
        StorageManager::with_custom_directory(temp_dir.path().to_path_buf()).unwrap()
    }

    #[tokio::test]
    async fn test_storage_creation() {
        let storage = create_test_storage().await;
        assert!(storage.ensure_storage_dir().await.is_ok());
    }

    #[tokio::test]
    async fn test_state_save_load() {
        let storage = create_test_storage().await;
        
        let mut state = UpdateStorage::default();
        state.current_version = "1.2.3".to_string();
        state.last_ignored_version = Some("1.2.2".to_string());
        
        // Salva stato
        assert!(storage.save_state(&state).await.is_ok());
        
        // Ricarica stato
        let loaded_state = storage.load_state().await.unwrap();
        assert_eq!(loaded_state.current_version, "1.2.3");
        assert_eq!(loaded_state.last_ignored_version, Some("1.2.2".to_string()));
        assert!(loaded_state.last_check_timestamp > 0); // Dovrebbe essere aggiornato
    }

    #[tokio::test]
    async fn test_config_save_load() {
        let storage = create_test_storage().await;
        
        let mut config = UpdateConfig::default();
        config.include_prerelease = false;
        config.check_interval_seconds = 7200;
        
        // Salva config
        assert!(storage.save_config(&config).await.is_ok());
        
        // Ricarica config
        let loaded_config = storage.load_config().await.unwrap();
        assert_eq!(loaded_config.include_prerelease, false);
        assert_eq!(loaded_config.check_interval_seconds, 7200);
    }

    #[tokio::test]
    async fn test_version_operations() {
        let storage = create_test_storage().await;
        
        // Testa mark_version_ignored
        storage.mark_version_ignored("1.2.3".to_string()).await.unwrap();
        let state = storage.load_state().await.unwrap();
        assert_eq!(state.last_ignored_version, Some("1.2.3".to_string()));
        
        // Testa set_changelog_pending
        storage.set_changelog_pending("1.2.4".to_string()).await.unwrap();
        let state = storage.load_state().await.unwrap();
        assert_eq!(state.show_changelog_for, Some("1.2.4".to_string()));
        
        // Testa mark_changelog_shown
        storage.mark_changelog_shown("1.2.4".to_string()).await.unwrap();
        let state = storage.load_state().await.unwrap();
        assert_eq!(state.show_changelog_for, None);
    }

    #[tokio::test]
    async fn test_stats() {
        let storage = create_test_storage().await;
        
        // Salva stato per avere dati
        let mut state = UpdateStorage::default();
        state.current_version = "1.0.0".to_string();
        storage.save_state(&state).await.unwrap();
        
        let stats = storage.get_stats().await.unwrap();
        assert_eq!(stats.current_version, "1.0.0");
        assert!(stats.last_check_timestamp > 0);
        assert!(!stats.next_check_due); // Appena controllato
    }

    #[tokio::test]
    async fn test_corrupted_file_handling() {
        let storage = create_test_storage().await;
        storage.ensure_storage_dir().await.unwrap();
        
        // Scrivi file JSON corrotto
        let corrupted_content = "{ invalid json content }";
        fs::write(storage.state_file_path(), corrupted_content).await.unwrap();
        
        // Il load dovrebbe gestire il file corrotto e restituire default
        let state = storage.load_state().await.unwrap();
        assert_eq!(state, UpdateStorage::default());
        
        // Il file corrotto dovrebbe essere stato spostato
        assert!(storage.storage_directory().read_dir().unwrap().any(|entry| {
            entry.unwrap().file_name().to_str().unwrap().contains("corrupted")
        }));
    }

    #[tokio::test]
    async fn test_cleanup_old_files() {
        let storage = create_test_storage().await;
        storage.ensure_storage_dir().await.unwrap();
        
        // Crea alcuni file finti
        let old_backup = storage.storage_directory().join("backup_old");
        let recent_file = storage.storage_directory().join("recent.txt");
        let temp_file = storage.storage_directory().join("test.tmp");
        
        fs::write(&old_backup, "old backup").await.unwrap();
        fs::write(&recent_file, "recent file").await.unwrap();
        fs::write(&temp_file, "temp file").await.unwrap();
        
        // Il cleanup dovrebbe rimuovere file vecchi (simuliamo età con max_age_days molto basso)
        let result = storage.cleanup_old_data(0).await.unwrap();
        
        // Dovrebbe aver rimosso almeno il file temporaneo
        assert!(result.files_removed > 0);
        assert!(result.bytes_freed > 0);
    }

    #[test]
    fn test_format_functions() {
        let stats = UpdateStats {
            last_check_timestamp: 1000,
            time_since_last_check: Some(3661), // 1 hour, 1 minute, 1 second
            next_check_due: false,
            has_ignored_version: false,
            has_pending_changelog: true,
            current_version: "1.0.0".to_string(),
            config: UpdateConfig::default(),
        };
        
        let formatted = stats.format_time_since_check();
        assert!(formatted.contains("1 hours ago"));
        
        let cleanup = CleanupResult {
            files_removed: 5,
            bytes_freed: 1_500_000,
        };
        
        let formatted = cleanup.format_result();
        assert!(formatted.contains("5 files"));
        assert!(formatted.contains("1.5 MB"));
    }
}