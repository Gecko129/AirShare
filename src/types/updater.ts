// src/types/updater.ts

/**
 * Stati possibili del sistema di aggiornamento
 */
export type UpdateState = 
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'update-available'; data: UpdateInfo }
  | { type: 'downloading'; progress: number; totalSize: number; downloaded: number }
  | { type: 'installing' }
  | { type: 'completed'; version: string }
  | { type: 'error'; message: string }
  | { type: 'changelog-pending'; version: string };

/**
 * Informazioni su un aggiornamento disponibile
 */
export interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
  releaseName: string;
  changelog: string;
  publishedAt: string;
  isPrerelease: boolean;
  downloadAsset: ReleaseAsset;
}

/**
 * Asset di una release GitHub
 */
export interface ReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
  contentType: string;
}

/**
 * Progress del download
 */
export interface DownloadProgress {
  downloaded: number;
  totalSize: number;
  percentage: number;
  speedBps: number;
  etaSeconds: number;
}

/**
 * Informazioni del changelog da mostrare
 */
export interface ChangelogInfo {
  version: string;
  releaseName: string;
  changelog: string;
  publishedAt: string;
}

/**
 * Statistiche degli aggiornamenti
 */
export interface UpdateStats {
  lastCheckTimestamp: number;
  timeSinceLastCheck?: number;
  nextCheckDue: boolean;
  hasIgnoredVersion: boolean;
  hasPendingChangelog: boolean;
  currentVersion: string;
  config: UpdateConfig;
}

/**
 * Configurazione degli aggiornamenti
 */
export interface UpdateConfig {
  includePrerelease: boolean;
  checkIntervalSeconds: number;
  httpTimeoutSeconds: number;
  maxRetries: number;
}

/**
 * Informazioni sulla piattaforma
 */
export interface PlatformInfo {
  os: string;
  arch: string;
  family: string;
  platform?: Platform;
  supportedExtensions: string[];
}

/**
 * Piattaforme supportate
 */
export type Platform = 
  | 'MacOSArm64'
  | 'MacOSIntel'
  | 'Windows'
  | 'LinuxX64'
  | 'LinuxArm64';

/**
 * Risultato della pulizia file
 */
export interface CleanupResult {
  filesRemoved: number;
  bytesFreed: number;
}

/**
 * Eventi emessi dall'updater
 */
export interface UpdaterEvents {
  'updater-state-changed': UpdateState;
  'download-progress': DownloadProgress;
}

/**
 * Hook useUpdater return type
 */
export interface UseUpdaterReturn {
  // Stato corrente
  state: UpdateState;
  isChecking: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  hasError: boolean;
  hasUpdateAvailable: boolean;
  
  // Dati
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  error: string | null;
  
  // Azioni
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  ignoreUpdate: () => Promise<void>;
  resetError: () => void;
  
  // Statistiche
  stats: UpdateStats | null;
  platformInfo: PlatformInfo | null;
  
  // Changelog
  pendingChangelog: ChangelogInfo | null;
  markChangelogShown: () => Promise<void>;
}

/**
 * Props per UpdateDialog
 */
export interface UpdateDialogProps {
  open: boolean;
  updateInfo: UpdateInfo;
  onUpdate: () => void;
  onIgnore: () => void;
  onClose: () => void;
}

/**
 * Props per ChangelogDialog
 */
export interface ChangelogDialogProps {
  open: boolean;
  changelog: ChangelogInfo;
  onClose: () => void;
}

/**
 * Utility functions types
 */
export interface UpdaterUtils {
  formatFileSize: (bytes: number) => string;
  formatSpeed: (bytesPerSecond: number) => string;
  formatTimeRemaining: (seconds: number) => string;
  formatTimestamp: (timestamp: number) => string;
  parseVersion: (version: string) => { major: number; minor: number; patch: number; prerelease?: string };
  isNewerVersion: (current: string, remote: string) => boolean;
}