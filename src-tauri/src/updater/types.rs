// src-tauri/src/updater/types.rs

use serde::{Deserialize, Serialize};
use std::fmt;

/// Stati possibili del sistema di aggiornamento
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UpdateState {
    /// Nessuna operazione in corso
    Idle,
    /// Controllo aggiornamenti in corso
    Checking,
    /// Aggiornamento disponibile
    UpdateAvailable(UpdateInfo),
    /// Download in corso con percentuale
    Downloading { progress: f64, total_size: u64, downloaded: u64 },
    /// Installazione in corso
    Installing,
    /// Aggiornamento completato con successo
    Completed(String), // versione installata
    /// Errore durante il processo
    Error(String),
    /// Changelog da mostrare
    ChangelogPending(String), // versione per cui mostrare changelog
}

/// Informazioni su un aggiornamento disponibile
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateInfo {
    /// Versione corrente dell'app
    pub current_version: String,
    /// Nuova versione disponibile
    pub new_version: String,
    /// Nome display della release
    pub release_name: String,
    /// Changelog/body della release
    pub changelog: String,
    /// Data di pubblicazione
    pub published_at: String,
    /// Se è una pre-release
    pub is_prerelease: bool,
    /// Asset selezionato per il download
    pub download_asset: ReleaseAsset,
}

/// Asset di una release GitHub
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[allow(dead_code)]
pub struct ReleaseAsset {
    /// Nome del file
    pub name: String,
    /// URL per il download diretto
    pub browser_download_url: String,
    /// Dimensione in bytes
    pub size: u64,
    /// Tipo MIME del file
    pub content_type: String,
}

/// Release completa da GitHub API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct GitHubRelease {
    /// Tag della versione (es. "v0.3.2-beta")
    pub tag_name: String,
    /// Nome della release
    pub name: String,
    /// Corpo/changelog della release
    pub body: String,
    /// Data di pubblicazione ISO
    pub published_at: String,
    /// Se è una pre-release (beta)
    pub prerelease: bool,
    /// Se è una bozza
    pub draft: bool,
    /// Assets allegati
    pub assets: Vec<ReleaseAsset>,
}

/// Piattaforme supportate
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Platform {
    MacOSArm64,
    MacOSIntel,
    Windows,
    LinuxX64,
    LinuxArm64,
}

impl fmt::Display for Platform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

impl Platform {
    /// Pattern di matching per i nomi dei file asset
    #[allow(dead_code)]
    pub fn asset_patterns(&self) -> &[&str] {
        match self {
            Platform::MacOSArm64 => &["ARM64.dmg", "arm64.dmg", "aarch64.dmg"],
            Platform::MacOSIntel => &["x86_64.dmg", "intel.dmg"],
            Platform::Windows => &["-Setup.exe", ".exe", "-windows.exe"],
            Platform::LinuxX64 => &["-Linux.AppImage", ".deb", "-linux.deb", "-Linux.deb"],
            Platform::LinuxArm64 => &["-Linux-ARM64.AppImage", "-Linux-ARM64.deb", "-arm64.deb"],
        }
    }

    /// Estensione del file installer per questa piattaforma
    #[allow(dead_code)]
    pub fn installer_extension(&self) -> &str {
        match self {
            Platform::MacOSArm64 | Platform::MacOSIntel => ".dmg",
            Platform::Windows => ".exe",
            Platform::LinuxX64 | Platform::LinuxArm64 => ".AppImage", // Preferenza per AppImage
        }
    }

    /// Nome human-readable della piattaforma
    pub fn display_name(&self) -> &str {
        match self {
            Platform::MacOSArm64 => "macOS (Apple Silicon)",
            Platform::MacOSIntel => "macOS (Intel)",
            Platform::Windows => "Windows",
            Platform::LinuxX64 => "Linux (x64)",
            Platform::LinuxArm64 => "Linux (ARM64)",
        }
    }
}

/// Dati persistenti salvati su disco
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateStorage {
    /// Versione corrente dell'applicazione
    pub current_version: String,
    /// Ultima versione controllata
    pub last_checked_version: Option<String>,
    /// Ultima versione ignorata dall'utente
    pub last_ignored_version: Option<String>,
    /// Versione per cui mostrare changelog al prossimo avvio
    pub show_changelog_for: Option<String>,
    /// Timestamp dell'ultimo controllo
    pub last_check_timestamp: u64,
}

impl Default for UpdateStorage {
    fn default() -> Self {
        Self {
            current_version: "0.0.0".to_string(),
            last_checked_version: None,
            last_ignored_version: None,
            show_changelog_for: None,
            last_check_timestamp: 0,
        }
    }
}

/// Evento di progresso per il download
#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct DownloadProgress {
    /// Bytes scaricati
    pub downloaded: u64,
    /// Dimensione totale
    pub total_size: u64,
    /// Percentuale (0.0 - 100.0)
    pub percentage: f64,
    /// Velocità in bytes/sec (media)
    pub speed_bps: f64,
    /// Tempo stimato rimanente in secondi
    pub eta_seconds: f64,
}

#[allow(dead_code)]
impl DownloadProgress {
    pub fn new(downloaded: u64, total_size: u64, speed_bps: f64) -> Self {
        let percentage = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        let eta_seconds = if speed_bps > 0.0 && downloaded < total_size {
            (total_size - downloaded) as f64 / speed_bps
        } else {
            0.0
        };

        Self {
            downloaded,
            total_size,
            percentage,
            speed_bps,
            eta_seconds,
        }
    }

    /// Formatta la velocità in forma human-readable
    pub fn format_speed(&self) -> String {
        let speed = self.speed_bps;
        if speed >= 1_000_000.0 {
            format!("{:.1} MB/s", speed / 1_000_000.0)
        } else if speed >= 1_000.0 {
            format!("{:.1} KB/s", speed / 1_000.0)
        } else {
            format!("{:.0} B/s", speed)
        }
    }

    /// Formatta l'ETA in forma human-readable
    pub fn format_eta(&self) -> String {
        let seconds = self.eta_seconds as u64;
        if seconds > 3600 {
            format!("{}h {}m", seconds / 3600, (seconds % 3600) / 60)
        } else if seconds > 60 {
            format!("{}m {}s", seconds / 60, seconds % 60)
        } else {
            format!("{}s", seconds)
        }
    }

    /// Formatta le dimensioni in forma human-readable
    pub fn format_size(bytes: u64) -> String {
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

/// Configurazione per il controllo degli aggiornamenti
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConfig {
    /// Includere pre-release nel controllo
    pub include_prerelease: bool,
    /// Intervallo minimo tra controlli (secondi)
    pub check_interval_seconds: u64,
    /// Timeout per le richieste HTTP (secondi)
    pub http_timeout_seconds: u64,
    /// Retry automatici in caso di errore
    pub max_retries: u32,
}

impl Default for UpdateConfig {
    fn default() -> Self {
        Self {
            include_prerelease: true, // Include beta per ora
            check_interval_seconds: 3600, // 1 ora
            http_timeout_seconds: 30,
            max_retries: 3,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_patterns() {
        let macos_arm = Platform::MacOSArm64;
        assert!(macos_arm.asset_patterns().contains(&"ARM64.dmg"));
        
        let windows = Platform::Windows;
        assert!(windows.asset_patterns().contains(&"-Setup.exe"));
    }

    #[test]
    fn test_download_progress() {
        let progress = DownloadProgress::new(500, 1000, 100.0);
        assert_eq!(progress.percentage, 50.0);
        assert_eq!(progress.eta_seconds, 5.0);
    }

    #[test]
    fn test_format_functions() {
        let progress = DownloadProgress::new(0, 1000000, 1500000.0);
        assert_eq!(progress.format_speed(), "1.5 MB/s");
        assert_eq!(DownloadProgress::format_size(1500000), "1.5 MB");
    }
}