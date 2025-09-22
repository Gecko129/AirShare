// src-tauri/src/updater/version_manager.rs

use crate::updater::types::{GitHubRelease, UpdateStorage};
use semver::Version;
use std::cmp::Ordering;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum VersionError {
    #[error("Invalid version format: {0}")]
    InvalidFormat(String),
    
    #[error("Failed to parse semver: {0}")]
    SemverParseError(#[from] semver::Error),
    
    #[error("Version comparison failed: {0}")]
    ComparisonFailed(String),
}

/// Manager per il confronto e parsing delle versioni
#[allow(dead_code)]
pub struct VersionManager;

#[allow(dead_code)]
impl VersionManager {
    /// Confronta due versioni e restituisce se la remote è più nuova
    pub fn is_newer_version(current: &str, remote: &str) -> Result<bool, VersionError> {
        let current_parsed = Self::parse_version(current)?;
        let remote_parsed = Self::parse_version(remote)?;
        
        Ok(remote_parsed > current_parsed)
    }

    /// Confronta due versioni e restituisce l'ordinamento
    pub fn compare_versions(current: &str, remote: &str) -> Result<Ordering, VersionError> {
        let current_parsed = Self::parse_version(current)?;
        let remote_parsed = Self::parse_version(remote)?;
        
        Ok(remote_parsed.cmp(&current_parsed))
    }

    /// Normalizza una versione rimuovendo prefissi e gestendo suffissi
    pub fn normalize_version(version: &str) -> String {
        let mut cleaned = version.trim();
        
        // Rimuovi prefisso "v" se presente
        if cleaned.starts_with('v') || cleaned.starts_with('V') {
            cleaned = &cleaned[1..];
        }
        
        // Gestisci suffissi comuni (-beta, -alpha, -rc)
        if let Some(dash_pos) = cleaned.find('-') {
            let (base_version, suffix) = cleaned.split_at(dash_pos);
            let suffix = suffix.replace('-', ".");
            
            // Converti suffissi in formato semver-compatibile
            let normalized_suffix = match suffix.to_lowercase().as_str() {
                ".beta" => "-beta.1",
                ".alpha" => "-alpha.1", 
                ".rc" => "-rc.1",
                s if s.starts_with(".beta.") => &s.replace(".beta.", "-beta."),
                s if s.starts_with(".alpha.") => &s.replace(".alpha.", "-alpha."),
                s if s.starts_with(".rc.") => &s.replace(".rc.", "-rc."),
                _ => &suffix,
            };
            
            format!("{}{}", base_version, normalized_suffix)
        } else {
            cleaned.to_string()
        }
    }

    /// Parsa una versione in formato semver
    fn parse_version(version: &str) -> Result<Version, VersionError> {
        let normalized = Self::normalize_version(version);
        
        match Version::parse(&normalized) {
            Ok(v) => Ok(v),
            Err(e) => {
                // Prova ad aggiungere .0 se manca il patch number
                if let Ok(v) = Version::parse(&format!("{}.0", normalized)) {
                    return Ok(v);
                }
                
                // Prova ad aggiungere .0.0 se mancano minor e patch
                if let Ok(v) = Version::parse(&format!("{}.0.0", normalized)) {
                    return Ok(v);
                }
                
                Err(VersionError::InvalidFormat(format!(
                    "Cannot parse '{}' (normalized: '{}'): {}", 
                    version, normalized, e
                )))
            }
        }
    }

    /// Determina se dovremmo offrire un aggiornamento
    pub fn should_offer_update(
        current_version: &str,
        release: &GitHubRelease,
        storage: &UpdateStorage,
    ) -> Result<bool, VersionError> {
        let remote_version = &release.tag_name;
        
        // Controlla se è una versione più nuova
        if !Self::is_newer_version(current_version, remote_version)? {
            return Ok(false);
        }
        
        // Controlla se questa versione è già stata ignorata
        if let Some(ignored_version) = &storage.last_ignored_version {
            if ignored_version == remote_version {
                return Ok(false);
            }
        }
        
        // Controlla se abbiamo già controllato questa versione di recente
        if let Some(last_checked) = &storage.last_checked_version {
            if last_checked == remote_version {
                // Se è la stessa versione dell'ultimo controllo, 
                // controlla il timestamp per evitare spam
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                
                let time_since_check = now - storage.last_check_timestamp;
                
                // Non ri-offrire per almeno 1 ora
                if time_since_check < 3600 {
                    return Ok(false);
                }
            }
        }
        
        Ok(true)
    }

    /// Verifica se una versione è compatibile con l'app corrente
    pub fn is_compatible_version(current: &str, remote: &str) -> Result<bool, VersionError> {
        let current_parsed = Self::parse_version(current)?;
        let remote_parsed = Self::parse_version(remote)?;
        
        // Controlla compatibilità major version
        // Per ora accettiamo aggiornamenti solo entro la stessa major version
        Ok(current_parsed.major == remote_parsed.major)
    }

    /// Ottiene informazioni dettagliate su una versione
    pub fn get_version_info(version: &str) -> Result<VersionInfo, VersionError> {
        let normalized = Self::normalize_version(version);
        let parsed = Self::parse_version(&normalized)?;
        
        Ok(VersionInfo {
            original: version.to_string(),
            normalized: normalized,
            major: parsed.major,
            minor: parsed.minor,
            patch: parsed.patch,
            pre_release: parsed.pre.clone(),
            is_prerelease: !parsed.pre.is_empty(),
            is_stable: parsed.pre.is_empty(),
        })
    }

    /// Genera un changelog tra due versioni (placeholder per futura implementazione)
    pub fn generate_version_diff(from: &str, to: &str) -> Result<String, VersionError> {
        let from_info = Self::get_version_info(from)?;
        let to_info = Self::get_version_info(to)?;
        
        let mut diff = Vec::new();
        
        if from_info.major != to_info.major {
            diff.push(format!("Major update: {} → {}", from_info.major, to_info.major));
        }
        
        if from_info.minor != to_info.minor {
            diff.push(format!("Minor update: {} → {}", from_info.minor, to_info.minor));
        }
        
        if from_info.patch != to_info.patch {
            diff.push(format!("Patch update: {} → {}", from_info.patch, to_info.patch));
        }
        
        if from_info.is_prerelease != to_info.is_prerelease {
            if to_info.is_stable {
                diff.push("Upgraded to stable release".to_string());
            } else {
                diff.push("This is a pre-release version".to_string());
            }
        }
        
        if diff.is_empty() {
            diff.push("Version update".to_string());
        }
        
        Ok(diff.join(" • "))
    }
}

/// Informazioni dettagliate su una versione
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct VersionInfo {
    pub original: String,
    pub normalized: String,
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    pub pre_release: semver::Prerelease,
    pub is_prerelease: bool,
    pub is_stable: bool,
}

#[allow(dead_code)]
impl VersionInfo {
    /// Versione display-friendly
    pub fn display_version(&self) -> String {
        if self.is_prerelease {
            format!("v{}.{}.{}-{}", self.major, self.minor, self.patch, self.pre_release)
        } else {
            format!("v{}.{}.{}", self.major, self.minor, self.patch)
        }
    }

    /// Tipo di aggiornamento
    pub fn update_type(&self, other: &VersionInfo) -> UpdateType {
        if self.major != other.major {
            UpdateType::Major
        } else if self.minor != other.minor {
            UpdateType::Minor
        } else if self.patch != other.patch {
            UpdateType::Patch
        } else {
            UpdateType::PreRelease
        }
    }
}

/// Tipi di aggiornamento
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum UpdateType {
    Major,
    Minor, 
    Patch,
    PreRelease,
}

#[allow(dead_code)]
impl UpdateType {
    /// Descrizione human-readable del tipo di aggiornamento
    pub fn description(&self) -> &str {
        match self {
            UpdateType::Major => "Major version update with potential breaking changes",
            UpdateType::Minor => "Minor version update with new features",
            UpdateType::Patch => "Patch update with bug fixes and improvements", 
            UpdateType::PreRelease => "Pre-release version update",
        }
    }

    /// Icona per il tipo di aggiornamento
    pub fn icon(&self) -> &str {
        match self {
            UpdateType::Major => "🚀",
            UpdateType::Minor => "✨",
            UpdateType::Patch => "🔧",
            UpdateType::PreRelease => "🧪",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_version() {
        assert_eq!(VersionManager::normalize_version("v1.2.3"), "1.2.3");
        assert_eq!(VersionManager::normalize_version("1.2.3-beta"), "1.2.3-beta.1");
        assert_eq!(VersionManager::normalize_version("v0.3.2-beta"), "0.3.2-beta.1");
        assert_eq!(VersionManager::normalize_version("2.0.0"), "2.0.0");
    }

    #[test]
    fn test_version_comparison() {
        assert!(VersionManager::is_newer_version("1.0.0", "1.0.1").unwrap());
        assert!(VersionManager::is_newer_version("1.0.0", "1.1.0").unwrap());
        assert!(VersionManager::is_newer_version("1.0.0", "2.0.0").unwrap());
        assert!(!VersionManager::is_newer_version("1.0.1", "1.0.0").unwrap());
        assert!(!VersionManager::is_newer_version("1.0.0", "1.0.0").unwrap());
    }

    #[test]
    fn test_prerelease_versions() {
        assert!(VersionManager::is_newer_version("1.0.0-beta.1", "1.0.0").unwrap());
        assert!(VersionManager::is_newer_version("1.0.0", "1.0.1-beta.1").unwrap());
        assert!(!VersionManager::is_newer_version("1.0.0", "1.0.0-beta.1").unwrap());
    }

    #[test]
    fn test_version_info() {
        let info = VersionManager::get_version_info("v1.2.3-beta").unwrap();
        assert_eq!(info.major, 1);
        assert_eq!(info.minor, 2);
        assert_eq!(info.patch, 3);
        assert!(info.is_prerelease);
        assert!(!info.is_stable);
    }

    #[test]
    fn test_should_offer_update() {
        let mut storage = UpdateStorage::default();
        let release = GitHubRelease {
            tag_name: "v1.1.0".to_string(),
            name: "Test Release".to_string(),
            body: "Test body".to_string(),
            published_at: "2023-01-01T00:00:00Z".to_string(),
            prerelease: false,
            draft: false,
            assets: vec![],
        };

        // Dovrebbe offrire aggiornamento per versione più nuova
        assert!(VersionManager::should_offer_update("1.0.0", &release, &storage).unwrap());
        
        // Non dovrebbe offrire se già ignorata
        storage.last_ignored_version = Some("v1.1.0".to_string());
        assert!(!VersionManager::should_offer_update("1.0.0", &release, &storage).unwrap());
    }

    #[test]
    fn test_update_type() {
        let v1 = VersionManager::get_version_info("1.0.0").unwrap();
        let v2_major = VersionManager::get_version_info("2.0.0").unwrap();
        let v2_minor = VersionManager::get_version_info("1.1.0").unwrap();
        let v2_patch = VersionManager::get_version_info("1.0.1").unwrap();

        assert_eq!(v1.update_type(&v2_major), UpdateType::Major);
        assert_eq!(v1.update_type(&v2_minor), UpdateType::Minor);
        assert_eq!(v1.update_type(&v2_patch), UpdateType::Patch);
    }
}