import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { DeviceList } from './components/DeviceList';
import { FileTransfer } from './components/FileTransfer';
import { Waves, Zap, Settings } from 'lucide-react';
import { TransferPrompt } from './components/TransferPrompt';
import SettingsPanel from './components/SettingsPanel';
import { useUpdater } from './hooks/useUpdater';
import { UpdateDialog } from './components/UpdateDialog';
import { ChangelogDialog } from './components/ChangelogDialog';
import './i18n';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { t } = useTranslation();

  // Initialize updater system
  const {
    state,
    hasUpdateAvailable,
    updateInfo,
    downloadProgress,
    pendingChangelog,
    isDownloading,
    isInstalling,
    hasError,
    error,
    downloadAndInstall,
    ignoreUpdate,
    markChangelogShown,
    resetError,
  } = useUpdater();

  // Local state for dialog visibility
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showChangelogDialog, setShowChangelogDialog] = useState(false);
  const [showUpdateProgress, setShowUpdateProgress] = useState(false);

  const handleDeviceSelectionChange = (deviceIds: string[]) => {
    setSelectedDevices(deviceIds);
  };

  // Handle update available
  useEffect(() => {
    if (hasUpdateAvailable && updateInfo) {
      setShowUpdateDialog(true);
    }
  }, [hasUpdateAvailable, updateInfo]);

  // Handle changelog display
  useEffect(() => {
    if (pendingChangelog) {
      setShowChangelogDialog(true);
    }
  }, [pendingChangelog]);

  // Handle download/install progress
  useEffect(() => {
    if (isDownloading || isInstalling) {
      setShowUpdateProgress(true);
      setShowUpdateDialog(false);
    } else {
      setShowUpdateProgress(false);
    }
  }, [isDownloading, isInstalling]);

  // Update dialog actions
  const handleUpdateAccept = () => {
    setShowUpdateDialog(false);
    downloadAndInstall();
  };

  const handleUpdateIgnore = () => {
    ignoreUpdate();
    setShowUpdateDialog(false);
  };

  const handleChangelogClose = () => {
    if (pendingChangelog) {
      markChangelogShown();
    }
    setShowChangelogDialog(false);
  };

  // Format download progress
  const formatProgress = () => {
    if (!downloadProgress) return { percentage: 0, text: 'Preparazione...' };
    
    const { percentage, speedBps, etaSeconds } = downloadProgress;
    const speed = speedBps >= 1024 * 1024 
      ? `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`
      : `${(speedBps / 1024).toFixed(1)} KB/s`;
    
    const eta = etaSeconds > 60 
      ? `${Math.floor(etaSeconds / 60)}m ${Math.floor(etaSeconds % 60)}s`
      : `${Math.floor(etaSeconds)}s`;

    return {
      percentage: Math.round(percentage),
      text: `${speed} - ${eta} rimanenti`,
    };
  };

  // Genera array di particelle in modo sicuro
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 4 + Math.random() * 2
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black relative overflow-hidden">
      <Toaster richColors position="bottom-right" />
      
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-10 left-10 w-32 h-32 bg-gray-700/10 rounded-full blur-xl animate-pulse" />
        <div 
          className="absolute top-40 right-20 w-24 h-24 bg-slate-600/10 rounded-full blur-lg animate-pulse" 
          style={{ animationDelay: '1s' }} 
        />
        <div 
          className="absolute bottom-20 left-1/4 w-40 h-40 bg-gray-800/10 rounded-full blur-2xl animate-pulse" 
          style={{ animationDelay: '2s' }} 
        />
        <div 
          className="absolute bottom-40 right-1/3 w-28 h-28 bg-slate-700/10 rounded-full blur-xl animate-pulse" 
          style={{ animationDelay: '3s' }} 
        />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute w-1 h-1 bg-gray-400/20 rounded-full animate-bounce"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-gray-800/40 to-slate-700/40 backdrop-blur-md border border-gray-600/30">
              <Zap className="w-12 h-12 text-gray-100" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl text-gray-100 mb-2">AirShare</h1>
                {/* Update status indicator */}
                {state.type === 'checking' && (
                  <div className="flex items-center text-blue-400 text-xs bg-blue-900/20 px-2 py-1 rounded-full border border-blue-500/30">
                    <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Controllo...
                  </div>
                )}
                
                {hasUpdateAvailable && (
                  <button
                    onClick={() => setShowUpdateDialog(true)}
                    className="bg-green-600/80 hover:bg-green-600 text-white px-2 py-1 rounded-full text-xs transition-colors border border-green-500/50"
                  >
                    Aggiornamento disponibile
                  </button>
                )}
                
                {hasError && (
                  <button
                    onClick={resetError}
                    className="bg-red-600/80 hover:bg-red-600 text-white px-2 py-1 rounded-full text-xs transition-colors border border-red-500/50"
                    title={error || 'Errore sconosciuto'}
                  >
                    Errore
                  </button>
                )}
              </div>
              <p className="text-gray-400 text-lg">{t("app_subtitle")}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Waves className="w-5 h-5 animate-pulse" />
            <span>{t("listening_devices")}</span>
          </div>
        </div>

        {/* Main content - Flexible layout that adapts to content */}
        <div className="max-w-[1600px] mx-auto">
          <div className="grid xl:grid-cols-[1fr_1fr] lg:grid-cols-1 gap-8 items-start">
            {/* Device list - Can expand based on content */}
            <div className="order-1 w-full">
              <DeviceList 
                selectedDevices={selectedDevices}
                onSelectionChange={handleDeviceSelectionChange}
              />
            </div>

            {/* File transfer - Matches device list width */}
            <div className="order-2 w-full">
              <FileTransfer selectedDevices={selectedDevices} />
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-6 px-6 py-3 rounded-full backdrop-blur-md bg-gray-900/60 border border-gray-700/40">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-gray-400 text-sm">{t("airshare_active")}</span>
            </div>
            <div className="w-px h-4 bg-gray-700/60" />
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">{t("devices_selected", { count: selectedDevices.length })}</span>
            </div>
            <div className="w-px h-4 bg-gray-700/60" />
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">{t("scanning_interval")}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Transfer Prompt */}
      <TransferPrompt />

      {/* Settings gear - fixed bottom left */}
      <button
        aria-label="Apri impostazioni"
        className="fixed bottom-4 left-4 z-50 inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white shadow"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Settings Panel */}
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Update Progress Overlay */}
      {showUpdateProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-600">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-900/50 rounded-full flex items-center justify-center border border-blue-500/30">
                {isDownloading ? (
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </div>
              
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                {isDownloading ? 'Scaricamento in corso...' : 'Installazione in corso...'}
              </h3>
              
              {isDownloading && downloadProgress && (
                <>
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${formatProgress().percentage}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-300 mb-2">
                    {formatProgress().percentage}% - {formatProgress().text}
                  </p>
                </>
              )}
              
              <p className="text-xs text-gray-400 mt-4">
                Non chiudere l'applicazione durante l'aggiornamento
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Update Available Dialog */}
      {showUpdateDialog && updateInfo && (
        <UpdateDialog
          open={showUpdateDialog}
          updateInfo={updateInfo}
          onUpdate={handleUpdateAccept}
          onIgnore={handleUpdateIgnore}
          onClose={() => setShowUpdateDialog(false)}
        />
      )}

      {/* Changelog Dialog */}
      {showChangelogDialog && pendingChangelog && (
        <ChangelogDialog
          open={showChangelogDialog}
          changelog={pendingChangelog}
          onClose={handleChangelogClose}
        />
      )}
    </div>
  );
}