// src-tauri/src/updater/platform_detector.rs

use crate::updater::types::{Platform, ReleaseAsset};
use std::env;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum PlatformError {
    #[error("Unsupported platform: {0}")]
    UnsupportedPlatform(String),
    
    #[error("No compatible asset found for platform {0}")]
    NoCompatibleAsset(Platform),
    
    #[error("Multiple compatible assets found, unable to choose")]
    MultipleAssetsFound,
    
    #[error("Asset validation failed: {0}")]
    AssetValidationFailed(String),
}

/// Detector per identificare la piattaforma corrente e selezionare gli asset
#[allow(dead_code)]
pub struct PlatformDetector;

#[allow(dead_code)]
impl PlatformDetector {
    /// Rileva la piattaforma corrente del sistema
    pub fn detect_current_platform() -> Result<Platform, PlatformError> {
        let os = env::consts::OS;
        let arch = env::consts::ARCH;
        
        match (os, arch) {
            ("macos", "aarch64") => Ok(Platform::MacOSArm64),
            ("macos", "x86_64") => Ok(Platform::MacOSIntel),
            ("windows", _) => Ok(Platform::Windows), // Windows support per entrambe le arch
            ("linux", "x86_64") => Ok(Platform::LinuxX64),
            ("linux", "aarch64") => Ok(Platform::LinuxArm64),
            (os, arch) => Err(PlatformError::UnsupportedPlatform(
                format!("{}-{}", os, arch)
            )),
        }
    }

    /// Seleziona l'asset compatibile per una piattaforma specifica
    pub fn select_asset_for_platform(
        platform: Platform,
        assets: &[ReleaseAsset],
    ) -> Result<ReleaseAsset, PlatformError> {
        if assets.is_empty() {
            return Err(PlatformError::NoCompatibleAsset(platform));
        }

        let patterns = platform.asset_patterns();
        let mut compatible_assets = Vec::new();

        // Prima passata: cerca match esatti con i pattern
        for asset in assets {
            for pattern in patterns {
                if asset.name.contains(pattern) {
                    // Validazione aggiuntiva per evitare falsi positivi
                    if Self::validate_asset_for_platform(&asset, platform) {
                        compatible_assets.push(asset.clone());
                        break; // Una volta trovato un pattern, passa al prossimo asset
                    }
                }
            }
        }

        // Se non troviamo match esatti, prova match più flessibili
        if compatible_assets.is_empty() {
            compatible_assets = Self::find_fallback_assets(platform, assets);
        }

        match compatible_assets.len() {
            0 => {
                println!("No compatible assets found for platform {:?}", platform);
                println!("Available assets: {:?}", 
                    assets.iter().map(|a| &a.name).collect::<Vec<_>>());
                Err(PlatformError::NoCompatibleAsset(platform))
            },
            1 => Ok(compatible_assets.into_iter().next().unwrap()),
            _ => {
                // Se ci sono asset multipli, scegli il migliore
                Ok(Self::choose_best_asset(platform, compatible_assets))
            }
        }
    }

    /// Seleziona l'asset per la piattaforma corrente
    pub fn select_current_platform_asset(
        assets: &[ReleaseAsset],
    ) -> Result<ReleaseAsset, PlatformError> {
        let current_platform = Self::detect_current_platform()?;
        Self::select_asset_for_platform(current_platform, assets)
    }

    /// Valida se un asset è davvero compatibile con la piattaforma
    fn validate_asset_for_platform(asset: &ReleaseAsset, platform: Platform) -> bool {
        let name = asset.name.to_lowercase();
        let expected_extension = platform.installer_extension();

        // Controlla che l'estensione sia corretta
        if !name.ends_with(&expected_extension.to_lowercase()) {
            return false;
        }

        // Controlla dimensione minima ragionevole (almeno 1MB)
        if asset.size < 1_000_000 {
            return false;
        }

        // Validazioni specifiche per piattaforma
        match platform {
            Platform::MacOSArm64 => {
                // Deve contenere ARM64 o aarch64 e non deve contenere x86_64 o intel
                (name.contains("arm64") || name.contains("aarch64")) &&
                !name.contains("x86_64") && !name.contains("intel")
            },
            Platform::MacOSIntel => {
                // Deve contenere x86_64 o intel e non deve contenere ARM64
                (name.contains("x86_64") || name.contains("intel")) &&
                !name.contains("arm64") && !name.contains("aarch64")
            },
            Platform::Windows => {
                // Per Windows, accettiamo file .exe
                name.contains("setup") || name.contains("install") || name.contains("windows")
            },
            Platform::LinuxX64 => {
                // Deve essere Linux x64 e non ARM64
                name.contains("linux") && !name.contains("arm64") && !name.contains("aarch64")
            },
            Platform::LinuxArm64 => {
                // Deve essere Linux ARM64
                name.contains("linux") && (name.contains("arm64") || name.contains("aarch64"))
            },
        }
    }

    /// Cerca asset di fallback con criteri più rilassati
    fn find_fallback_assets(platform: Platform, assets: &[ReleaseAsset]) -> Vec<ReleaseAsset> {
        let mut fallbacks = Vec::new();
        let expected_extension = platform.installer_extension().to_lowercase();

        for asset in assets {
            let name = asset.name.to_lowercase();
            
            // Controlla solo l'estensione come fallback
            if name.ends_with(&expected_extension) {
                // Per piattaforme specifiche, controlla almeno che non sia per un'altra arch
                match platform {
                    Platform::MacOSArm64 => {
                        if !name.contains("x86_64") && !name.contains("intel") {
                            fallbacks.push(asset.clone());
                        }
                    },
                    Platform::MacOSIntel => {
                        if !name.contains("arm64") && !name.contains("aarch64") {
                            fallbacks.push(asset.clone());
                        }
                    },
                    Platform::LinuxArm64 => {
                        if !name.contains("x86_64") && !name.contains("amd64") {
                            fallbacks.push(asset.clone());
                        }
                    },
                    _ => {
                        fallbacks.push(asset.clone());
                    }
                }
            }
        }

        fallbacks
    }

    /// Sceglie il miglior asset tra asset multipli compatibili
    fn choose_best_asset(platform: Platform, assets: Vec<ReleaseAsset>) -> ReleaseAsset {
        // Priorità basate su preferenze per piattaforma
        let preferences = match platform {
            Platform::LinuxX64 | Platform::LinuxArm64 => {
                // Per Linux: preferisci AppImage > deb
                vec![".appimage", ".deb"]
            },
            _ => vec![], // Per altre piattaforme, prendi il primo
        };

        // Cerca asset secondo le preferenze
        for preference in preferences {
            if let Some(asset) = assets.iter()
                .find(|a| a.name.to_lowercase().contains(preference)) {
                return asset.clone();
            }
        }

        // Se non troviamo preferenze, prendi l'asset più grande (probabilmente più completo)
        assets.into_iter()
            .max_by_key(|asset| asset.size)
            .expect("Assets list should not be empty")
    }

    /// Ottiene informazioni dettagliate sulla piattaforma corrente
    pub fn get_platform_info() -> PlatformInfo {
        let current = Self::detect_current_platform().ok();
        
        PlatformInfo {
            os: env::consts::OS.to_string(),
            arch: env::consts::ARCH.to_string(),
            family: env::consts::FAMILY.to_string(),
            platform: current,
            supported_extensions: current.map(|p| {
                p.asset_patterns().iter().map(|s| s.to_string()).collect()
            }).unwrap_or_default(),
        }
    }

    /// Verifica se una piattaforma è supportata
    pub fn is_platform_supported() -> bool {
        Self::detect_current_platform().is_ok()
    }

    /// Lista tutte le piattaforme supportate
    pub fn supported_platforms() -> Vec<Platform> {
        vec![
            Platform::MacOSArm64,
            Platform::MacOSIntel,
            Platform::Windows,
            Platform::LinuxX64,
            Platform::LinuxArm64,
        ]
    }

    /// Ottiene suggerimenti per asset mancanti
    pub fn get_missing_asset_suggestions(assets: &[ReleaseAsset]) -> Vec<String> {
        let mut suggestions = Vec::new();
        let supported_platforms = Self::supported_platforms();

        for platform in supported_platforms {
            if Self::select_asset_for_platform(platform, assets).is_err() {
                let patterns = platform.asset_patterns();
                suggestions.push(format!(
                    "Missing {} asset. Expected patterns: {}",
                    platform.display_name(),
                    patterns.join(", ")
                ));
            }
        }

        suggestions
    }
}

/// Informazioni dettagliate sulla piattaforma
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(dead_code)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub platform: Option<Platform>,
    pub supported_extensions: Vec<String>,
}

#[allow(dead_code)]
impl PlatformInfo {
    /// Descrizione human-readable della piattaforma
    pub fn description(&self) -> String {
        match &self.platform {
            Some(platform) => format!("{} ({})", platform.display_name(), self.arch),
            None => format!("Unsupported: {}-{}", self.os, self.arch),
        }
    }

    /// Se la piattaforma è supportata
    pub fn is_supported(&self) -> bool {
        self.platform.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_assets() -> Vec<ReleaseAsset> {
        vec![
            ReleaseAsset {
                name: "AirShare-ARM64.dmg".to_string(),
                browser_download_url: "https://example.com/arm64.dmg".to_string(),
                size: 5_000_000,
                content_type: "application/x-diskcopy".to_string(),
            },
            ReleaseAsset {
                name: "AirShare-x86_64.dmg".to_string(),
                browser_download_url: "https://example.com/x64.dmg".to_string(),
                size: 5_200_000,
                content_type: "application/x-diskcopy".to_string(),
            },
            ReleaseAsset {
                name: "AirShare-Setup.exe".to_string(),
                browser_download_url: "https://example.com/setup.exe".to_string(),
                size: 3_000_000,
                content_type: "application/x-msdownload".to_string(),
            },
            ReleaseAsset {
                name: "AirShare-Linux.AppImage".to_string(),
                browser_download_url: "https://example.com/linux.AppImage".to_string(),
                size: 80_000_000,
                content_type: "application/octet-stream".to_string(),
            },
        ]
    }

    #[test]
    fn test_platform_detection() {
        let platform = PlatformDetector::detect_current_platform();
        assert!(platform.is_ok());
        
        let _platform = platform.unwrap();
        let info = PlatformDetector::get_platform_info();
        assert!(info.is_supported());
    }

    #[test]
    fn test_asset_selection_macos_arm() {
        let assets = create_test_assets();
        let result = PlatformDetector::select_asset_for_platform(Platform::MacOSArm64, &assets);
        
        assert!(result.is_ok());
        let asset = result.unwrap();
        assert!(asset.name.contains("ARM64"));
        assert!(asset.name.ends_with(".dmg"));
    }

    #[test]
    fn test_asset_selection_macos_intel() {
        let assets = create_test_assets();
        let result = PlatformDetector::select_asset_for_platform(Platform::MacOSIntel, &assets);
        
        assert!(result.is_ok());
        let asset = result.unwrap();
        assert!(asset.name.contains("x86_64"));
        assert!(asset.name.ends_with(".dmg"));
    }

    #[test]
    fn test_asset_selection_windows() {
        let assets = create_test_assets();
        let result = PlatformDetector::select_asset_for_platform(Platform::Windows, &assets);
        
        assert!(result.is_ok());
        let asset = result.unwrap();
        assert!(asset.name.ends_with(".exe"));
    }

    #[test]
    fn test_asset_selection_linux() {
        let assets = create_test_assets();
        let result = PlatformDetector::select_asset_for_platform(Platform::LinuxX64, &assets);
        
        assert!(result.is_ok());
        let asset = result.unwrap();
        assert!(asset.name.contains("Linux"));
        assert!(asset.name.ends_with(".AppImage"));
    }

    #[test]
    fn test_no_compatible_assets() {
        let empty_assets = vec![];
        let result = PlatformDetector::select_asset_for_platform(Platform::Windows, &empty_assets);
        
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), PlatformError::NoCompatibleAsset(_)));
    }

    #[test]
    fn test_asset_validation() {
        let valid_asset = ReleaseAsset {
            name: "AirShare-ARM64.dmg".to_string(),
            browser_download_url: "https://example.com/test.dmg".to_string(),
            size: 5_000_000,
            content_type: "application/x-diskcopy".to_string(),
        };

        let invalid_asset = ReleaseAsset {
            name: "AirShare-ARM64.dmg".to_string(),
            browser_download_url: "https://example.com/test.dmg".to_string(),
            size: 100, // Troppo piccolo
            content_type: "application/x-diskcopy".to_string(),
        };

        assert!(PlatformDetector::validate_asset_for_platform(&valid_asset, Platform::MacOSArm64));
        assert!(!PlatformDetector::validate_asset_for_platform(&invalid_asset, Platform::MacOSArm64));
    }

    #[test]
    fn test_missing_asset_suggestions() {
        let incomplete_assets = vec![
            ReleaseAsset {
                name: "AirShare-Setup.exe".to_string(),
                browser_download_url: "https://example.com/setup.exe".to_string(),
                size: 3_000_000,
                content_type: "application/x-msdownload".to_string(),
            },
        ];

        let suggestions = PlatformDetector::get_missing_asset_suggestions(&incomplete_assets);
        assert!(!suggestions.is_empty());
        
        // Dovrebbe suggerire asset mancanti per macOS e Linux
        assert!(suggestions.iter().any(|s| s.contains("macOS")));
        assert!(suggestions.iter().any(|s| s.contains("Linux")));
    }
}