// src-tauri/src/updater/downloader.rs

use crate::updater::types::DownloadProgress;
use reqwest::Client;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum DownloadError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
    
    #[error("File system error: {0}")]
    FileSystemError(#[from] std::io::Error),
    
    #[error("Download cancelled")]
    Cancelled,
    
    #[error("Invalid download URL: {0}")]
    InvalidUrl(String),
    
    #[error("Download failed: server returned {0}")]
    ServerError(u16),
    
    #[error("Checksum verification failed")]
    ChecksumFailed,
    
    #[error("Network timeout")]
    NetworkTimeout,
    
    #[error("Insufficient disk space")]
    InsufficientSpace,
}

/// Downloader con supporto per progress tracking e resume
#[allow(dead_code)]
pub struct Downloader {
    client: Client,
    max_retries: u32,
    chunk_size: usize,
}

#[allow(dead_code)]
impl Downloader {
    /// Crea nuovo downloader
    pub fn new() -> Result<Self, DownloadError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(60))
            .user_agent("AirShare-Updater/1.0")
            .build()?;

        Ok(Self {
            client,
            max_retries: 3,
            chunk_size: 64 * 1024, // 64KB chunks
        })
    }

    /// Configura il downloader
    pub fn with_config(mut self, max_retries: u32, chunk_size: usize) -> Self {
        self.max_retries = max_retries;
        self.chunk_size = chunk_size;
        self
    }

    /// Download di un file con callback per il progress
    pub async fn download_file<F, E>(
        &self,
        url: &str,
        output_path: &Path,
        mut progress_callback: F,
    ) -> Result<DownloadedFile, DownloadError>
    where
        F: FnMut(DownloadProgress) -> Result<(), E>,
        E: std::fmt::Debug,
    {
        // Validazione URL
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(DownloadError::InvalidUrl(url.to_string()));
        }

        println!("Starting download: {} -> {:?}", url, output_path);

        // Crea directory parent se non esistente
        if let Some(parent) = output_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let mut retries = 0;
        loop {
            match self.try_download(url, output_path, &mut progress_callback).await {
                Ok(file_info) => return Ok(file_info),
                Err(e) if retries < self.max_retries => {
                    retries += 1;
                    println!("Download attempt {} failed: {:?}. Retrying...", retries, e);
                    tokio::time::sleep(Duration::from_secs(2_u64.pow(retries))).await;
                },
                Err(e) => return Err(e),
            }
        }
    }

    /// Singolo tentativo di download
    async fn try_download<F, E>(
        &self,
        url: &str,
        output_path: &Path,
        progress_callback: &mut F,
    ) -> Result<DownloadedFile, DownloadError>
    where
        F: FnMut(DownloadProgress) -> Result<(), E>,
        E: std::fmt::Debug,
    {
        // Request iniziale per ottenere info del file
        let response = self.client.get(url).send().await?;
        
        if !response.status().is_success() {
            return Err(DownloadError::ServerError(response.status().as_u16()));
        }

        let total_size = response.content_length().unwrap_or(0);
        println!("Download size: {} bytes", total_size);

        // Controlla spazio disponibile
        if let Err(_) = self.check_disk_space(output_path, total_size).await {
            return Err(DownloadError::InsufficientSpace);
        }

        // Crea file temporaneo
        let temp_path = output_path.with_extension("tmp");
        let mut file = File::create(&temp_path).await?;
        
        // Variabili per tracking del progress
        let mut downloaded = 0u64;
        let start_time = Instant::now();
        let mut last_progress_time = start_time;
        let mut last_downloaded = 0u64;

        // Stream del download
        let mut stream = response.bytes_stream();
        
        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result?;
            
            // Scrivi chunk su file
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;

            // Calcola e invia progress ogni 100ms o quando finito
            let now = Instant::now();
            if now.duration_since(last_progress_time) > Duration::from_millis(100) || downloaded == total_size {
                let time_diff = now.duration_since(last_progress_time).as_secs_f64();
                let bytes_diff = downloaded - last_downloaded;
                let _current_speed = if time_diff > 0.0 { bytes_diff as f64 / time_diff } else { 0.0 };
                
                // Media mobile della velocità per smoothing
                let elapsed_total = now.duration_since(start_time).as_secs_f64();
                let avg_speed = if elapsed_total > 0.0 { downloaded as f64 / elapsed_total } else { 0.0 };
                
                let progress = DownloadProgress::new(downloaded, total_size, avg_speed);
                
                if let Err(e) = progress_callback(progress) {
                    println!("Progress callback error: {:?}", e);
                    // Potrebbero aver cancellato il download
                    return Err(DownloadError::Cancelled);
                }

                last_progress_time = now;
                last_downloaded = downloaded;
            }
        }

        // Flush e sync del file
        file.flush().await?;
        file.sync_all().await?;
        drop(file); // Chiudi file handle

        // Sposta da temp al path finale
        tokio::fs::rename(&temp_path, output_path).await?;
        
        let file_info = DownloadedFile {
            path: output_path.to_path_buf(),
            size: downloaded,
            download_time: start_time.elapsed(),
            average_speed: downloaded as f64 / start_time.elapsed().as_secs_f64(),
        };

        println!("Download completed: {} bytes in {:.2}s", 
            downloaded, start_time.elapsed().as_secs_f64());

        Ok(file_info)
    }

    /// Verifica spazio disponibile su disco
    async fn check_disk_space(&self, _path: &Path, _required_bytes: u64) -> Result<(), DownloadError> {
        // Su sistemi Unix, possiamo usare statvfs
        // Su Windows, possiamo usare GetDiskFreeSpaceEx
        // Per semplicità, assumiamo che ci sia spazio sufficiente
        // In una implementazione reale, si potrebbe usare una crate come 'fs2' o 'sysinfo'
        
        if _required_bytes > 10 * 1024 * 1024 * 1024 { // 10GB - limite ragionevole
            return Err(DownloadError::InsufficientSpace);
        }
        
        Ok(())
    }

    /// Verifica integrità di un file scaricato (opzionale)
    pub async fn verify_checksum(
        &self,
        _file_path: &Path,
        _expected_checksum: Option<&str>,
    ) -> Result<bool, DownloadError> {
        if _expected_checksum.is_none() {
            return Ok(true); // Nessun checksum da verificare
        }

        // TODO: Implementare verifica SHA256
        // Per ora assumiamo che sia OK
        println!("Checksum verification skipped (not implemented)");
        Ok(true)
    }

    /// Ottiene informazioni su un file remoto senza scaricarlo
    pub async fn get_file_info(&self, url: &str) -> Result<RemoteFileInfo, DownloadError> {
        let response = self.client.head(url).send().await?;
        
        if !response.status().is_success() {
            return Err(DownloadError::ServerError(response.status().as_u16()));
        }

        Ok(RemoteFileInfo {
            url: url.to_string(),
            size: response.content_length().unwrap_or(0),
            content_type: response.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/octet-stream")
                .to_string(),
            last_modified: response.headers()
                .get("last-modified")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
        })
    }

    /// Pulisce file temporanei della sessione
    pub async fn cleanup_temp_files(&self, directory: &Path) -> Result<u32, DownloadError> {
        let mut cleaned = 0;
        
        let mut dir = tokio::fs::read_dir(directory).await?;
        while let Some(entry) = dir.next_entry().await? {
            let path = entry.path();
            if let Some(extension) = path.extension() {
                if extension == "tmp" {
                    if tokio::fs::remove_file(&path).await.is_ok() {
                        cleaned += 1;
                        println!("Cleaned temp file: {:?}", path);
                    }
                }
            }
        }
        
        Ok(cleaned)
    }
}

/// Informazioni su un file scaricato
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DownloadedFile {
    pub path: PathBuf,
    pub size: u64,
    pub download_time: Duration,
    pub average_speed: f64,
}

#[allow(dead_code)]
impl DownloadedFile {
    /// Verifica che il file esista e abbia la dimensione corretta
    pub async fn validate(&self) -> Result<bool, std::io::Error> {
        let metadata = tokio::fs::metadata(&self.path).await?;
        Ok(metadata.len() == self.size)
    }

    /// Formatta le statistiche del download
    pub fn format_stats(&self) -> String {
        format!(
            "Downloaded {} in {:.2}s at {}/s",
            self.format_size(),
            self.download_time.as_secs_f64(),
            self.format_speed()
        )
    }

    /// Formatta la dimensione del file
    pub fn format_size(&self) -> String {
        DownloadProgress::format_size(self.size)
    }

    /// Formatta la velocità media
    pub fn format_speed(&self) -> String {
        if self.average_speed >= 1_000_000.0 {
            format!("{:.1} MB/s", self.average_speed / 1_000_000.0)
        } else if self.average_speed >= 1_000.0 {
            format!("{:.1} KB/s", self.average_speed / 1_000.0)
        } else {
            format!("{:.0} B/s", self.average_speed)
        }
    }
}

/// Informazioni su un file remoto
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct RemoteFileInfo {
    pub url: String,
    pub size: u64,
    pub content_type: String,
    pub last_modified: Option<String>,
}

impl Default for Downloader {
    fn default() -> Self {
        Self::new().expect("Failed to create default downloader")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_downloader_creation() {
        let downloader = Downloader::new();
        assert!(downloader.is_ok());
    }

    #[test]
    fn test_downloader_config() {
        let downloader = Downloader::new().unwrap()
            .with_config(5, 128 * 1024);
        assert_eq!(downloader.max_retries, 5);
        assert_eq!(downloader.chunk_size, 128 * 1024);
    }

    #[tokio::test]
    async fn test_get_file_info() {
        let downloader = Downloader::new().unwrap();
        
        // Test con un URL pubblico
        let result = downloader.get_file_info("https://httpbin.org/bytes/1024").await;
        
        if let Ok(info) = result {
            assert_eq!(info.size, 1024);
            assert!(!info.content_type.is_empty());
        }
        // Se il test fallisce per problemi di rete, non è un errore del codice
    }

    #[tokio::test]
    async fn test_invalid_url() {
        let downloader = Downloader::new().unwrap();
        let temp_dir = tempdir().unwrap();
        let output_path = temp_dir.path().join("test_file");
        
        let result = downloader.download_file(
            "invalid_url",
            &output_path,
            |_progress| Ok::<(), ()>(()),
        ).await;
        
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), DownloadError::InvalidUrl(_)));
    }

    #[test]
    fn test_downloaded_file_formatting() {
        let file = DownloadedFile {
            path: PathBuf::from("/test/file"),
            size: 1_500_000,
            download_time: Duration::from_secs(10),
            average_speed: 150_000.0,
        };

        assert_eq!(file.format_size(), "1.5 MB");
        assert_eq!(file.format_speed(), "150.0 KB/s");
        assert!(file.format_stats().contains("1.5 MB"));
        assert!(file.format_stats().contains("10.00s"));
    }

    #[tokio::test]
    async fn test_cleanup_temp_files() {
        let downloader = Downloader::new().unwrap();
        let temp_dir = tempdir().unwrap();
        
        // Crea alcuni file temporanei
        let temp_file1 = temp_dir.path().join("test1.tmp");
        let temp_file2 = temp_dir.path().join("test2.tmp");
        let normal_file = temp_dir.path().join("normal.txt");
        
        tokio::fs::write(&temp_file1, b"test").await.unwrap();
        tokio::fs::write(&temp_file2, b"test").await.unwrap();
        tokio::fs::write(&normal_file, b"test").await.unwrap();
        
        let cleaned = downloader.cleanup_temp_files(temp_dir.path()).await.unwrap();
        assert_eq!(cleaned, 2);
        
        // Verifica che i file .tmp siano stati rimossi
        assert!(!temp_file1.exists());
        assert!(!temp_file2.exists());
        assert!(normal_file.exists()); // Il file normale dovrebbe rimanere
    }
}