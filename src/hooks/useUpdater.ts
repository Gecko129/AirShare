// src/hooks/useUpdater.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { 
  UpdateState, 
  UpdateInfo, 
  ChangelogInfo, 
  DownloadProgress, 
  UseUpdaterReturn,
  UpdateStats,
  PlatformInfo
} from '../types/updater';

/**
 * Hook principale per gestire il sistema di aggiornamenti
 */
export const useUpdater = (): UseUpdaterReturn => {
  // Stati principali
  const [state, setState] = useState<UpdateState>({ type: 'idle' });
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [stats, setStats] = useState<UpdateStats | null>(null);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [pendingChangelog, setPendingChangelog] = useState<ChangelogInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs per cleanup
  const unlistenStateRef = useRef<UnlistenFn | null>(null);
  const unlistenProgressRef = useRef<UnlistenFn | null>(null);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stati derivati
  const isChecking = state.type === 'checking';
  const isDownloading = state.type === 'downloading';
  const isInstalling = state.type === 'installing';
  const hasError = state.type === 'error';
  const hasUpdateAvailable = state.type === 'update-available';
  
  const updateInfo = hasUpdateAvailable ? state.data : null;

  /**
   * Inizializzazione e setup listeners
   */
  useEffect(() => {
    const initializeUpdater = async () => {
      try {
        // Carica stato iniziale
        await loadInitialState();
        
        // Setup event listeners
        await setupEventListeners();
        
        // Carica informazioni piattaforma
        await loadPlatformInfo();
        
        // Controlla changelog pendente
        await checkPendingChangelog();
        
        // Programma controllo automatico
        scheduleAutoCheck();
        
      } catch (error) {
        console.error('Failed to initialize updater:', error);
        setError(`Initialization failed: ${error}`);
      }
    };

    initializeUpdater();

    // Cleanup function
    return () => {
      if (unlistenStateRef.current) {
        unlistenStateRef.current();
      }
      if (unlistenProgressRef.current) {
        unlistenProgressRef.current();
      }
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Carica lo stato iniziale dal backend
   */
  const loadInitialState = async () => {
    try {
      const backendState = await invoke<any>('get_updater_state');
      setState(convertBackendState(backendState));
      
      const statsData = await invoke<UpdateStats>('get_updater_stats');
      setStats(statsData);
    } catch (error) {
      console.warn('Failed to load initial state:', error);
    }
  };

  /**
   * Setup event listeners per aggiornamenti in tempo reale
   */
  const setupEventListeners = async () => {
    // Listener per cambiamenti di stato
    unlistenStateRef.current = await listen<any>('updater-state-changed', (event) => {
      const newState = convertBackendState(event.payload);
      setState(newState);
      
      // Reset errore se lo stato cambia
      if (newState.type !== 'error') {
        setError(null);
      }
    });

    // Listener per progress del download
    unlistenProgressRef.current = await listen<DownloadProgress>('download-progress', (event) => {
      setDownloadProgress(event.payload);
    });
  };

  /**
   * Carica informazioni della piattaforma
   */
  const loadPlatformInfo = async () => {
    try {
      const info = await invoke<PlatformInfo>('get_platform_info');
      setPlatformInfo(info);
    } catch (error) {
      console.warn('Failed to load platform info:', error);
    }
  };

  /**
   * Controlla se c'è un changelog da mostrare
   */
  const checkPendingChangelog = async () => {
    try {
      const changelog = await invoke<ChangelogInfo | null>('get_pending_changelog');
      if (changelog) {
        setPendingChangelog(changelog);
      }
    } catch (error) {
      console.warn('Failed to check pending changelog:', error);
    }
  };

  /**
   * Programma controllo automatico
   */
  const scheduleAutoCheck = () => {
    // Controlla all'avvio dopo 3 secondi
    checkTimeoutRef.current = setTimeout(() => {
      checkForUpdates(true); // true = silent check
    }, 3000);
  };

  /**
   * Controlla aggiornamenti disponibili
   */
  const checkForUpdates = useCallback(async (silent: boolean = false) => {
    if (isChecking || isDownloading || isInstalling) {
      return; // Evita controlli multipli
    }

    try {
      if (!silent) {
        setState({ type: 'checking' });
      }

      const result = await invoke<UpdateInfo | null>('check_for_updates');
      
      if (result) {
        setState({ type: 'update-available', data: result });
      } else {
        setState({ type: 'idle' });
      }

      // Aggiorna statistiche
      const newStats = await invoke<UpdateStats>('get_updater_stats');
      setStats(newStats);

    } catch (error) {
      const errorMessage = `Check failed: ${error}`;
      setState({ type: 'error', message: errorMessage });
      setError(errorMessage);
    }
  }, [isChecking, isDownloading, isInstalling]);

  /**
   * Scarica e installa aggiornamento
   */
  const downloadAndInstall = useCallback(async () => {
    if (!hasUpdateAvailable || isDownloading || isInstalling) {
      return;
    }

    try {
      setState({ type: 'downloading', progress: 0, totalSize: 0, downloaded: 0 });
      
      await invoke('download_and_install_update');
      
      // L'app si riavvierà automaticamente, quindi non dovremmo arrivare qui
      setState({ type: 'completed', version: updateInfo?.newVersion || 'unknown' });
      
    } catch (error) {
      const errorMessage = `Installation failed: ${error}`;
      setState({ type: 'error', message: errorMessage });
      setError(errorMessage);
    }
  }, [hasUpdateAvailable, isDownloading, isInstalling, updateInfo]);

  /**
   * Ignora la versione corrente
   */
  const ignoreUpdate = useCallback(async () => {
    if (!hasUpdateAvailable) {
      return;
    }

    try {
      const version = updateInfo?.newVersion;
      if (version) {
        await invoke('ignore_update_version', { version });
        setState({ type: 'idle' });
      }
    } catch (error) {
      console.error('Failed to ignore update:', error);
      setError(`Failed to ignore update: ${error}`);
    }
  }, [hasUpdateAvailable, updateInfo]);

  /**
   * Segna il changelog come mostrato
   */
  const markChangelogShown = useCallback(async () => {
    if (!pendingChangelog) {
      return;
    }

    try {
      await invoke('mark_changelog_shown', { version: pendingChangelog.version });
      setPendingChangelog(null);
    } catch (error) {
      console.error('Failed to mark changelog as shown:', error);
    }
  }, [pendingChangelog]);

  /**
   * Reset errore
   */
  const resetError = useCallback(() => {
    setError(null);
    setState({ type: 'idle' });
  }, []);

  /**
   * Converte lo stato dal backend al formato frontend
   */
  const convertBackendState = (backendState: any): UpdateState => {
    if (!backendState || typeof backendState !== 'object') {
      return { type: 'idle' };
    }

    // Il backend restituisce enum Rust, convertiamo in discriminated union TypeScript
    if ('Idle' in backendState) {
      return { type: 'idle' };
    }
    if ('Checking' in backendState) {
      return { type: 'checking' };
    }
    if ('UpdateAvailable' in backendState) {
      return { type: 'update-available', data: backendState.UpdateAvailable };
    }
    if ('Downloading' in backendState) {
      const downloading = backendState.Downloading;
      return {
        type: 'downloading',
        progress: downloading.progress || 0,
        totalSize: downloading.total_size || 0,
        downloaded: downloading.downloaded || 0
      };
    }
    if ('Installing' in backendState) {
      return { type: 'installing' };
    }
    if ('Completed' in backendState) {
      return { type: 'completed', version: backendState.Completed || 'unknown' };
    }
    if ('Error' in backendState) {
      return { type: 'error', message: backendState.Error || 'Unknown error' };
    }
    if ('ChangelogPending' in backendState) {
      return { type: 'changelog-pending', version: backendState.ChangelogPending || 'unknown' };
    }

    return { type: 'idle' };
  };

  return {
    // Stati
    state,
    isChecking,
    isDownloading,
    isInstalling,
    hasError,
    hasUpdateAvailable,
    
    // Dati
    updateInfo,
    downloadProgress,
    error,
    
    // Azioni
    checkForUpdates,
    downloadAndInstall,
    ignoreUpdate,
    resetError,
    
    // Informazioni
    stats,
    platformInfo,
    
    // Changelog
    pendingChangelog,
    markChangelogShown,
  };
};