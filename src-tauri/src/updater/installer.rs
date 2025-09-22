// src-tauri/src/updater/installer.rs

use crate::updater::types::Platform;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use thiserror::Error;
use std::env;
// Note: tauri::api::process non esiste più in Tauri 2
// use tauri::api::process::{restart, exit};

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum InstallerError {
    #[error("Installation failed: {0}")]
    InstallationFailed(String),
    
    #[error("Unsupported platform for installation: {0:?}")]
    UnsupportedPlatform(Platform),
    
    #[error("File not found: {0}")]
    FileNotFound(String),
    
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    
    #[error("Process execution failed: {0}")]
    ProcessFailed(String),
    
    #[error("Installation validation failed: {0}")]
    ValidationFailed(String),
    
    #[error("Backup creation failed: {0}")]
    BackupFailed(String),
}

/// Installer per gestire l'aggiornamento dell'applicazione
#[allow(dead_code)]
pub struct Installer {
    platform: Platform,
    backup_enabled: bool,
}

#[allow(dead_code)]
impl Installer {
    /// Crea nuovo installer per la piattaforma corrente
    pub fn new() -> Result<Self, InstallerError> {
        let platform = Self::detect_platform()?;
        Ok(Self {
            platform,
            backup_enabled: true,
        })
    }

    /// Configura se creare backup prima dell'installazione
    pub fn with_backup(mut self, enabled: bool) -> Self {
        self.backup_enabled = enabled;
        self
    }

    /// Installa l'aggiornamento
    pub async fn install_update(
        &self,
        downloaded_file: &Path,
    ) -> Result<InstallationResult, InstallerError> {
        println!("Starting installation for platform {:?}", self.platform);
        println!("Installing from: {:?}", downloaded_file);

        // Verifica che il file esista
        if !downloaded_file.exists() {
            return Err(InstallerError::FileNotFound(
                downloaded_file.display().to_string()
            ));
        }

        // Crea backup se abilitato
        let backup_info = if self.backup_enabled {
            Some(self.create_backup().await?)
        } else {
            None
        };

        // Installa basato sulla piattaforma
        let result = match self.platform {
            Platform::MacOSArm64 | Platform::MacOSIntel => {
                self.install_macos(downloaded_file).await
            },
            Platform::Windows => {
                self.install_windows(downloaded_file).await
            },
            Platform::LinuxX64 | Platform::LinuxArm64 => {
                self.install_linux(downloaded_file).await
            },
        };

        match result {
            Ok(path) => Ok(InstallationResult {
                installed_path: path,
                backup_info,
                platform: self.platform,
                installation_time: std::time::SystemTime::now(),
            }),
            Err(e) => {
                // Se l'installazione fallisce e abbiamo un backup, proponi il rollback
                if let Some(backup) = backup_info {
                    println!("Installation failed, backup available at: {:?}", backup.backup_path);
                }
                Err(e)
            }
        }
    }

    /// Installazione per macOS (.dmg)
    async fn install_macos(&self, dmg_file: &Path) -> Result<PathBuf, InstallerError> {
        println!("Installing macOS DMG: {:?}", dmg_file);

        // Su macOS, il processo è più complesso:
        // 1. Mount del DMG
        // 2. Copia dell'app nella directory Applications
        // 3. Unmount del DMG

        let mount_point = self.mount_dmg(dmg_file).await?;
        
        // Trova l'app dentro il DMG
        let app_in_dmg = self.find_app_in_mount(&mount_point).await?;
        let apps_dir = PathBuf::from("/Applications");
        let target_path = apps_dir.join(app_in_dmg.file_name().unwrap());

        // Rimuovi vecchia versione se presente
        if target_path.exists() {
            println!("Removing old version: {:?}", target_path);
            let result = Command::new("rm")
                .args(["-rf", target_path.to_str().unwrap()])
                .output();
                
            if let Err(e) = result {
                self.unmount_dmg(&mount_point).await.ok(); // Cleanup
                return Err(InstallerError::ProcessFailed(format!("Failed to remove old app: {}", e)));
            }
        }

        // Copia nuova versione
        println!("Copying app: {:?} -> {:?}", app_in_dmg, target_path);
        let result = Command::new("cp")
            .args(["-R", app_in_dmg.to_str().unwrap(), apps_dir.to_str().unwrap()])
            .output();

        // Unmount DMG
        self.unmount_dmg(&mount_point).await.ok();

        match result {
            Ok(output) if output.status.success() => {
                // Verifica che l'installazione sia riuscita
                if target_path.exists() {
                    println!("macOS installation completed: {:?}", target_path);
                    Ok(target_path)
                } else {
                    Err(InstallerError::ValidationFailed("App not found after installation".to_string()))
                }
            },
            Ok(output) => {
                let error = String::from_utf8_lossy(&output.stderr);
                Err(InstallerError::ProcessFailed(format!("Copy failed: {}", error)))
            },
            Err(e) => {
                Err(InstallerError::ProcessFailed(format!("Copy command failed: {}", e)))
            }
        }
    }

    /// Mount di un DMG file
    async fn mount_dmg(&self, dmg_file: &Path) -> Result<PathBuf, InstallerError> {
        let output = Command::new("hdiutil")
            .args(["attach", "-nobrowse", "-quiet", dmg_file.to_str().unwrap()])
            .output()
            .map_err(|e| InstallerError::ProcessFailed(format!("hdiutil attach failed: {}", e)))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(InstallerError::ProcessFailed(format!("Failed to mount DMG: {}", error)));
        }

        // Parse dell'output per trovare il mount point
        let output_str = String::from_utf8_lossy(&output.stdout);
        for line in output_str.lines() {
            if line.contains("/Volumes/") {
                if let Some(mount_point) = line.split_whitespace().find(|s| s.starts_with("/Volumes/")) {
                    return Ok(PathBuf::from(mount_point));
                }
            }
        }

        Err(InstallerError::ProcessFailed("Could not find mount point".to_string()))
    }

    /// Trova l'app dentro il mount point
    async fn find_app_in_mount(&self, mount_point: &Path) -> Result<PathBuf, InstallerError> {
        let mut dir = tokio::fs::read_dir(mount_point).await
            .map_err(|e| InstallerError::ProcessFailed(format!("Cannot read mount directory: {}", e)))?;

        while let Some(entry) = dir.next_entry().await
            .map_err(|e| InstallerError::ProcessFailed(format!("Cannot read directory entry: {}", e)))? {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "app") {
                return Ok(path);
            }
        }

        Err(InstallerError::ProcessFailed("No .app found in DMG".to_string()))
    }

    /// Unmount di un DMG
    async fn unmount_dmg(&self, mount_point: &Path) -> Result<(), InstallerError> {
        let result = Command::new("hdiutil")
            .args(["detach", mount_point.to_str().unwrap()])
            .output();

        match result {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => {
                let error = String::from_utf8_lossy(&output.stderr);
                println!("Warning: Failed to unmount DMG: {}", error);
                Ok(()) // Non è critico se fallisce
            },
            Err(e) => {
                println!("Warning: hdiutil detach failed: {}", e);
                Ok(()) // Non è critico se fallisce
            }
        }
    }

    /// Installazione per Windows (.exe)
    async fn install_windows(&self, exe_file: &Path) -> Result<PathBuf, InstallerError> {
        println!("Installing Windows EXE: {:?}", exe_file);

        // Su Windows, eseguiamo l'installer
        // Molti installer supportano /S per silent install
        let result = Command::new(exe_file)
            .args(["/S"]) // Silent install
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status();

        match result {
            Ok(status) if status.success() => {
                // L'installer di solito installa in Program Files
                let program_files = env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files".to_string());
                let installed_path = PathBuf::from(program_files).join("AirShare");
                
                println!("Windows installation completed: {:?}", installed_path);
                Ok(installed_path)
            },
            Ok(status) => {
                Err(InstallerError::ProcessFailed(format!("Installer exited with code: {:?}", status.code())))
            },
            Err(e) => {
                Err(InstallerError::ProcessFailed(format!("Failed to run installer: {}", e)))
            }
        }
    }

    /// Installazione per Linux (.AppImage/.deb)
    async fn install_linux(&self, installer_file: &Path) -> Result<PathBuf, InstallerError> {
        println!("Installing Linux package: {:?}", installer_file);

        let file_name = installer_file.file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| InstallerError::ProcessFailed("Invalid filename".to_string()))?;

        if file_name.ends_with(".AppImage") {
            // Per AppImage, spostiamo in una directory standard
            let target_dir = PathBuf::from(env::var("HOME").unwrap_or_else(|_| "/tmp".to_string()))
                .join(".local/bin");
            
            tokio::fs::create_dir_all(&target_dir).await
                .map_err(|e| InstallerError::ProcessFailed(format!("Cannot create target directory: {}", e)))?;

            let target_path = target_dir.join("AirShare.AppImage");
            
            // Copia e rendi eseguibile
            tokio::fs::copy(installer_file, &target_path).await
                .map_err(|e| InstallerError::ProcessFailed(format!("Cannot copy AppImage: {}", e)))?;

            let result = Command::new("chmod")
                .args(["+x", target_path.to_str().unwrap()])
                .status();

            match result {
                Ok(status) if status.success() => {
                    println!("Linux AppImage installation completed: {:?}", target_path);
                    Ok(target_path)
                },
                _ => Err(InstallerError::ProcessFailed("Failed to make AppImage executable".to_string()))
            }

        } else if file_name.ends_with(".deb") {
            // Per .deb, usiamo dpkg
            let result = Command::new("sudo")
                .args(["dpkg", "-i", installer_file.to_str().unwrap()])
                .status();

            match result {
                Ok(status) if status.success() => {
                    let installed_path = PathBuf::from("/usr/bin/airshare"); // Assumi path standard
                    println!("Linux DEB installation completed: {:?}", installed_path);
                    Ok(installed_path)
                },
                Ok(status) => {
                    Err(InstallerError::ProcessFailed(format!("dpkg failed with code: {:?}", status.code())))
                },
                Err(e) => {
                    Err(InstallerError::ProcessFailed(format!("Failed to run dpkg: {}", e)))
                }
            }
        } else {
            Err(InstallerError::UnsupportedPlatform(self.platform))
        }
    }

    /// Crea backup dell'installazione corrente
    async fn create_backup(&self) -> Result<BackupInfo, InstallerError> {
        let current_exe = env::current_exe()
            .map_err(|e| InstallerError::BackupFailed(format!("Cannot get current exe path: {}", e)))?;
            
        let backup_dir = self.get_backup_directory()?;
        tokio::fs::create_dir_all(&backup_dir).await
            .map_err(|e| InstallerError::BackupFailed(format!("Cannot create backup directory: {}", e)))?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let backup_name = format!("airshare_backup_{}", timestamp);
        let backup_path = backup_dir.join(&backup_name);

        match self.platform {
            Platform::MacOSArm64 | Platform::MacOSIntel => {
                // Su macOS, backup dell'intera app bundle
                if let Some(app_bundle) = current_exe.ancestors().find(|p| p.extension().map_or(false, |ext| ext == "app")) {
                    let result = Command::new("cp")
                        .args(["-R", app_bundle.to_str().unwrap(), backup_path.to_str().unwrap()])
                        .status();
                    
                    if result.is_err() || !result.unwrap().success() {
                        return Err(InstallerError::BackupFailed("Failed to backup macOS app".to_string()));
                    }
                }
            },
            _ => {
                // Su altre piattaforme, copia l'eseguibile
                tokio::fs::copy(&current_exe, &backup_path).await
                    .map_err(|e| InstallerError::BackupFailed(format!("Cannot copy exe for backup: {}", e)))?;
            }
        }

        Ok(BackupInfo {
            backup_path,
            original_path: current_exe,
            created_at: std::time::SystemTime::now(),
        })
    }

    /// Ottiene la directory per i backup
    fn get_backup_directory(&self) -> Result<PathBuf, InstallerError> {
        let base_dir = match dirs::data_dir() {
            Some(dir) => dir.join("AirShare").join("backups"),
            None => {
                return Err(InstallerError::BackupFailed("Cannot determine data directory".to_string()));
            }
        };
        
        Ok(base_dir)
    }

    /// Rileva la piattaforma corrente
    fn detect_platform() -> Result<Platform, InstallerError> {
        crate::updater::platform_detector::PlatformDetector::detect_current_platform()
            .map_err(|_e| InstallerError::UnsupportedPlatform(Platform::MacOSArm64)) // Placeholder
    }

    /// Riavvia l'applicazione dopo l'installazione
    pub async fn restart_application(&self) -> Result<(), InstallerError> {
        println!("Preparing to restart application...");
        
        // Aspetta un momento per permettere cleanup
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        // TODO: Implementare riavvio per Tauri 2
        // In Tauri 2, il riavvio deve essere gestito diversamente
        println!("Application restart requested - please restart manually");
        
        Ok(())
    }

    /// Pulisce file temporaneli dell'installazione
    pub async fn cleanup_installation_files(&self, files: &[PathBuf]) -> Result<u32, InstallerError> {
        let mut cleaned = 0;
        
        for file in files {
            if file.exists() {
                if tokio::fs::remove_file(file).await.is_ok() {
                    cleaned += 1;
                    println!("Cleaned installation file: {:?}", file);
                }
            }
        }
        
        Ok(cleaned)
    }
}

/// Risultato di un'installazione
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct InstallationResult {
    pub installed_path: PathBuf,
    pub backup_info: Option<BackupInfo>,
    pub platform: Platform,
    pub installation_time: std::time::SystemTime,
}

#[allow(dead_code)]
impl InstallationResult {
    /// Verifica che l'installazione sia valida
    pub async fn validate(&self) -> Result<bool, InstallerError> {
        // Controlla che il path installato esista
        if !self.installed_path.exists() {
            return Ok(false);
        }

        // Controlli specifici per piattaforma
        match self.platform {
            Platform::MacOSArm64 | Platform::MacOSIntel => {
                // Su macOS, controlla che sia un'app bundle valida
                let info_plist = self.installed_path.join("Contents/Info.plist");
                Ok(info_plist.exists())
            },
            Platform::Windows => {
                // Su Windows, controlla che l'exe sia eseguibile
                Ok(self.installed_path.extension().map_or(false, |ext| ext == "exe"))
            },
            Platform::LinuxX64 | Platform::LinuxArm64 => {
                // Su Linux, controlla i permessi di esecuzione
                let metadata = tokio::fs::metadata(&self.installed_path).await
                    .map_err(|e| InstallerError::ValidationFailed(format!("Cannot read file metadata: {}", e)))?;
                    
                // Su Unix, controlla che abbia permessi di esecuzione
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let permissions = metadata.permissions();
                    Ok(permissions.mode() & 0o111 != 0) // Check execute bits
                }
                
                #[cfg(not(unix))]
                Ok(true)
            }
        }
    }

    /// Dimensione dell'installazione
    pub async fn installation_size(&self) -> Result<u64, InstallerError> {
        match self.platform {
            Platform::MacOSArm64 | Platform::MacOSIntel => {
                // Per macOS, calcola dimensione dell'app bundle
                Self::calculate_directory_size(&self.installed_path).await
            },
            _ => {
                // Per altri, dimensione del singolo file
                let metadata = tokio::fs::metadata(&self.installed_path).await
                    .map_err(|e| InstallerError::ValidationFailed(format!("Cannot read file size: {}", e)))?;
                Ok(metadata.len())
            }
        }
    }

    /// Calcola dimensione ricorsiva di una directory
    async fn calculate_directory_size(path: &Path) -> Result<u64, InstallerError> {
        let mut total_size = 0u64;
        let mut stack = vec![path.to_path_buf()];

        while let Some(current_path) = stack.pop() {
            let metadata = tokio::fs::metadata(&current_path).await
                .map_err(|e| InstallerError::ValidationFailed(format!("Cannot read metadata: {}", e)))?;

            if metadata.is_dir() {
                let mut dir = tokio::fs::read_dir(&current_path).await
                    .map_err(|e| InstallerError::ValidationFailed(format!("Cannot read directory: {}", e)))?;
                    
                while let Some(entry) = dir.next_entry().await
                    .map_err(|e| InstallerError::ValidationFailed(format!("Cannot read directory entry: {}", e)))? {
                    stack.push(entry.path());
                }
            } else {
                total_size += metadata.len();
            }
        }

        Ok(total_size)
    }

    /// Formatta le informazioni dell'installazione
    pub fn format_info(&self) -> String {
        format!(
            "Installed to: {}\nPlatform: {}\nTime: {:?}",
            self.installed_path.display(),
            self.platform.display_name(),
            self.installation_time
        )
    }
}

/// Informazioni di backup
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct BackupInfo {
    pub backup_path: PathBuf,
    pub original_path: PathBuf,
    pub created_at: std::time::SystemTime,
}

#[allow(dead_code)]
impl BackupInfo {
    /// Ripristina dal backup
    pub async fn restore(&self) -> Result<(), InstallerError> {
        println!("Restoring from backup: {:?}", self.backup_path);

        if !self.backup_path.exists() {
            return Err(InstallerError::BackupFailed("Backup file not found".to_string()));
        }

        // Determina la piattaforma per il tipo di ripristino
        let platform = crate::updater::platform_detector::PlatformDetector::detect_current_platform()
            .map_err(|_| InstallerError::BackupFailed("Cannot detect platform for restore".to_string()))?;

        match platform {
            Platform::MacOSArm64 | Platform::MacOSIntel => {
                // Su macOS, usa cp per copiare l'app bundle
                let result = Command::new("cp")
                    .args(["-R", self.backup_path.to_str().unwrap(), "/Applications/"])
                    .status();
                    
                match result {
                    Ok(status) if status.success() => Ok(()),
                    _ => Err(InstallerError::BackupFailed("Failed to restore macOS app from backup".to_string()))
                }
            },
            _ => {
                // Su altre piattaforme, copia il file eseguibile
                tokio::fs::copy(&self.backup_path, &self.original_path).await
                    .map_err(|e| InstallerError::BackupFailed(format!("Cannot restore from backup: {}", e)))?;
                Ok(())
            }
        }
    }

    /// Elimina il backup
    pub async fn delete(&self) -> Result<(), InstallerError> {
        if self.backup_path.is_dir() {
            tokio::fs::remove_dir_all(&self.backup_path).await
        } else {
            tokio::fs::remove_file(&self.backup_path).await
        }
        .map_err(|e| InstallerError::BackupFailed(format!("Cannot delete backup: {}", e)))
    }

    /// Dimensione del backup
    pub async fn size(&self) -> Result<u64, InstallerError> {
        if self.backup_path.is_dir() {
            InstallationResult::calculate_directory_size(&self.backup_path).await
        } else {
            let metadata = tokio::fs::metadata(&self.backup_path).await
                .map_err(|e| InstallerError::BackupFailed(format!("Cannot read backup size: {}", e)))?;
            Ok(metadata.len())
        }
    }

    /// Formatta informazioni del backup
    pub fn format_info(&self) -> String {
        format!(
            "Backup: {}\nOriginal: {}\nCreated: {:?}",
            self.backup_path.display(),
            self.original_path.display(),
            self.created_at
        )
    }
}

impl Default for Installer {
    fn default() -> Self {
        Self::new().expect("Failed to create default installer")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_installer_creation() {
        let installer = Installer::new();
        assert!(installer.is_ok());
    }

    #[test]
    fn test_installer_config() {
        let installer = Installer::new().unwrap().with_backup(false);
        assert!(!installer.backup_enabled);
    }

    #[tokio::test]
    async fn test_backup_directory() {
        let installer = Installer::new().unwrap();
        let backup_dir = installer.get_backup_directory();
        assert!(backup_dir.is_ok());
        
        let dir = backup_dir.unwrap();
        assert!(dir.to_string_lossy().contains("AirShare"));
        assert!(dir.to_string_lossy().contains("backups"));
    }

    #[tokio::test]
    async fn test_cleanup_installation_files() {
        let installer = Installer::new().unwrap();
        let temp_dir = tempdir().unwrap();
        
        // Crea alcuni file temporanei
        let file1 = temp_dir.path().join("installer1.exe");
        let file2 = temp_dir.path().join("installer2.dmg");
        
        tokio::fs::write(&file1, b"test").await.unwrap();
        tokio::fs::write(&file2, b"test").await.unwrap();
        
        let files = vec![file1.clone(), file2.clone()];
        let cleaned = installer.cleanup_installation_files(&files).await.unwrap();
        
        assert_eq!(cleaned, 2);
        assert!(!file1.exists());
        assert!(!file2.exists());
    }

    #[tokio::test]
    async fn test_installation_result() {
        let temp_dir = tempdir().unwrap();
        let installed_path = temp_dir.path().join("test_app");
        
        // Crea un file finto per il test
        tokio::fs::write(&installed_path, b"test app").await.unwrap();
        
        let result = InstallationResult {
            installed_path: installed_path.clone(),
            backup_info: None,
            platform: Platform::LinuxX64,
            installation_time: std::time::SystemTime::now(),
        };
        
        let size = result.installation_size().await.unwrap();
        assert_eq!(size, 8); // "test app" = 8 bytes
        
        let info = result.format_info();
        assert!(info.contains("Linux"));
        assert!(info.contains(&installed_path.display().to_string()));
    }

    #[test]
    fn test_backup_info_format() {
        let temp_dir = tempdir().unwrap();
        let backup_path = temp_dir.path().join("backup");
        let original_path = temp_dir.path().join("original");
        
        let backup_info = BackupInfo {
            backup_path: backup_path.clone(),
            original_path: original_path.clone(),
            created_at: std::time::SystemTime::now(),
        };
        
        let info = backup_info.format_info();
        assert!(info.contains("Backup:"));
        assert!(info.contains("Original:"));
        assert!(info.contains("Created:"));
    }
}