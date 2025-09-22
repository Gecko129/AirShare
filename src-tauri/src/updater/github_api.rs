// src-tauri/src/updater/github_api.rs

use crate::updater::types::GitHubRelease;
use reqwest::{Client, StatusCode};
use serde_json;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum GitHubError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
    
    #[error("JSON parsing failed: {0}")]
    JsonError(#[from] serde_json::Error),
    
    #[error("No releases found")]
    NoReleasesFound,
    
    #[error("API rate limit exceeded")]
    RateLimitExceeded,
    
    #[error("Repository not found or access denied")]
    RepositoryNotFound,
    
    #[error("Network timeout")]
    NetworkTimeout,
}

/// Client per interagire con le GitHub API
#[allow(dead_code)]
pub struct GitHubClient {
    client: Client,
    repo_owner: String,
    repo_name: String,
    base_url: String,
}

#[allow(dead_code)]
impl GitHubClient {
    /// Crea nuovo client GitHub API
    pub fn new(repo_owner: String, repo_name: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("AirShare-Updater/1.0")
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            repo_owner,
            repo_name,
            base_url: "https://api.github.com".to_string(),
        }
    }

    /// Ottiene l'ultima release disponibile
    /// Prima prova /releases/latest (solo release stabili)
    /// Se 404, usa /releases e prende la prima (include pre-release)
    pub async fn get_latest_release(&self) -> Result<GitHubRelease, GitHubError> {
        // Strategia 1: Prova prima le release stabili
        match self.get_latest_stable_release().await {
            Ok(release) => return Ok(release),
            Err(GitHubError::NoReleasesFound) => {
                // Se non ci sono release stabili, prova con le pre-release
                println!("No stable releases found, trying pre-releases...");
            },
            Err(e) => return Err(e), // Altri errori vengono propagati
        }

        // Strategia 2: Fallback su tutte le release (include pre-release)
        self.get_latest_any_release().await
    }

    /// Ottiene l'ultima release stabile (non pre-release)
    async fn get_latest_stable_release(&self) -> Result<GitHubRelease, GitHubError> {
        let url = format!(
            "{}/repos/{}/{}/releases/latest",
            self.base_url, self.repo_owner, self.repo_name
        );

        println!("Checking for stable releases: {}", url);

        let response = self.client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => {
                let release: GitHubRelease = response.json().await?;
                Ok(release)
            },
            StatusCode::NOT_FOUND => {
                Err(GitHubError::NoReleasesFound)
            },
            StatusCode::FORBIDDEN | StatusCode::UNAUTHORIZED => {
                Err(GitHubError::RepositoryNotFound)
            },
            StatusCode::TOO_MANY_REQUESTS => {
                Err(GitHubError::RateLimitExceeded)
            },
            _ => {
                Err(GitHubError::HttpError(reqwest::Error::from(
                    response.error_for_status().unwrap_err()
                )))
            }
        }
    }

    /// Ottiene l'ultima release tra tutte (incluse pre-release)
    async fn get_latest_any_release(&self) -> Result<GitHubRelease, GitHubError> {
        let url = format!(
            "{}/repos/{}/{}/releases",
            self.base_url, self.repo_owner, self.repo_name
        );

        println!("Checking for all releases: {}", url);

        let response = self.client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .query(&[("per_page", "10")]) // Prendi solo le prime 10
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => {
                let releases: Vec<GitHubRelease> = response.json().await?;
                
                if releases.is_empty() {
                    return Err(GitHubError::NoReleasesFound);
                }

                // Prendi la prima release (più recente)
                // In futuro si potrebbe filtrare per preferire non-prerelease
                let latest_release = releases.into_iter().next().unwrap();
                Ok(latest_release)
            },
            StatusCode::NOT_FOUND => {
                Err(GitHubError::RepositoryNotFound)
            },
            StatusCode::FORBIDDEN | StatusCode::UNAUTHORIZED => {
                Err(GitHubError::RepositoryNotFound)
            },
            StatusCode::TOO_MANY_REQUESTS => {
                Err(GitHubError::RateLimitExceeded)
            },
            _ => {
                Err(GitHubError::HttpError(reqwest::Error::from(
                    response.error_for_status().unwrap_err()
                )))
            }
        }
    }

    /// Scarica un file da un URL con streaming
    pub async fn download_file_stream(&self, url: &str) -> Result<reqwest::Response, GitHubError> {
        println!("Starting download from: {}", url);

        let response = self.client
            .get(url)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(GitHubError::HttpError(reqwest::Error::from(
                response.error_for_status().unwrap_err()
            )));
        }

        Ok(response)
    }

    /// Verifica la connettività con GitHub
    pub async fn test_connection(&self) -> Result<bool, GitHubError> {
        let url = format!(
            "{}/repos/{}/{}",
            self.base_url, self.repo_owner, self.repo_name
        );

        let response = self.client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => Ok(true),
            StatusCode::NOT_FOUND => Err(GitHubError::RepositoryNotFound),
            StatusCode::FORBIDDEN | StatusCode::UNAUTHORIZED => {
                Err(GitHubError::RepositoryNotFound)
            },
            StatusCode::TOO_MANY_REQUESTS => {
                Err(GitHubError::RateLimitExceeded)
            },
            _ => Ok(false),
        }
    }

    /// Estrae changelog pulito dal body della release
    pub fn extract_changelog(&self, release: &GitHubRelease) -> String {
        let body = &release.body;
        
        // Cerca la sezione "What's New" o "Novità"
        if let Some(start) = body.find("## What's New") {
            if let Some(end) = body[start..].find("\n---\n").or_else(|| body[start..].find("\n##")) {
                let changelog = &body[start..start + end];
                return self.clean_markdown(changelog);
            }
        }

        // Se non trova sezione specifica, prendi tutto ma pulisci
        if body.len() > 500 {
            // Se troppo lungo, prendi solo i primi paragrafi
            let truncated = body.chars().take(500).collect::<String>();
            if let Some(last_newline) = truncated.rfind('\n') {
                return self.clean_markdown(&truncated[..last_newline]);
            }
        }

        self.clean_markdown(body)
    }

    /// Pulisce il markdown per una visualizzazione più semplice
    fn clean_markdown(&self, text: &str) -> String {
        text
            .replace("![Beta]", "")
            .replace("![Platform]", "")
            .replace("![Tauri]", "")
            .replace("![Backend Rust]", "")
            .replace("![Frontend React]", "")
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter(|line| !line.starts_with("!["))
            .map(|line| {
                // Rimuovi alcuni pattern markdown comuni
                line.replace("**", "")
                    .replace("- ", "• ")
                    .trim()
                    .to_string()
            })
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Getter per informazioni del repository
    pub fn repo_info(&self) -> (String, String) {
        (self.repo_owner.clone(), self.repo_name.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = GitHubClient::new("owner".to_string(), "repo".to_string());
        let (owner, repo) = client.repo_info();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[tokio::test]
    async fn test_connection_invalid_repo() {
        let client = GitHubClient::new("invalid_owner_12345".to_string(), "invalid_repo_12345".to_string());
        let result = client.test_connection().await;
        assert!(result.is_err());
        
        if let Err(e) = result {
            assert!(matches!(e, GitHubError::RepositoryNotFound));
        }
    }

    #[test]
    fn test_clean_markdown() {
        let client = GitHubClient::new("test".to_string(), "test".to_string());
        
        let input = "**Bold text**\n![Badge](url)\n- Item 1\n- Item 2";
        let cleaned = client.clean_markdown(input);
        
        assert!(!cleaned.contains("**"));
        assert!(!cleaned.contains("![Badge]"));
        assert!(cleaned.contains("• Item 1"));
    }

    #[test]
    fn test_extract_changelog() {
        let client = GitHubClient::new("test".to_string(), "test".to_string());
        
        let release = GitHubRelease {
            tag_name: "v1.0.0".to_string(),
            name: "Test Release".to_string(),
            body: "## What's New\n- Feature 1\n- Bug fix\n---\n## Installation\nSteps...".to_string(),
            published_at: "2023-01-01T00:00:00Z".to_string(),
            prerelease: false,
            draft: false,
            assets: vec![],
        };

        let changelog = client.extract_changelog(&release);
        assert!(changelog.contains("Feature 1"));
        assert!(changelog.contains("Bug fix"));
        assert!(!changelog.contains("Installation"));
    }
}