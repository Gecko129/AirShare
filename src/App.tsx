import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./driver.css";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";
import { Badge } from "./components/ui/badge";
import {
  Settings,
  Wifi,
  Send,
  History,
  Zap,
  HelpCircle,
} from "lucide-react";
import { DeviceDetection } from "./components/DeviceDetection";
import { FileTransfer } from "./components/FileTransfer";
import { Settings as SettingsComponent } from "./components/Settings";
import { ThemeProvider } from "./components/ThemeProvider";
import { motion, AnimatePresence } from "motion/react";
import { DynamicSidebar } from "./components/DynamicSidebar";
import { TransferHistory } from "./components/TransferHistory";
import { CanvasBackground } from "./components/CanvasBackground";
import PrivacyPolicy from "./components/PrivacyPolicy";
import TermsOfService from "./components/TermsOfService";
import { TransferPrompt } from "./components/TransferPrompt";
import { AutoAcceptNotification } from './components/AutoAcceptNotification';
import { TransferNotification } from './components/TransferNotification';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTour } from "./hooks/useTour";

interface UploadFile {
  name: string;
  size: number;
  path?: string;
}

type BackendTransferRecord = {
  id: string;
  fileName: string;
  fileSize: number;
  transferType: 'sent' | 'received';
  status: 'completed' | 'cancelled' | 'failed';
  fromDevice: string;
  toDevice: string;
  startTime: string;
  duration: number;
  speed: number;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
};

function AppContent() {
  const { t } = useTranslation();
  
  const [selectedDevices, setSelectedDevices] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<UploadFile[]>([]);
  const [activeTab, setActiveTab] = useState("transfer");
  
  const { startTour, checkAndStartTour } = useTour(setActiveTab);

  useEffect(() => {
    checkAndStartTour();
  }, []);

  const [avgSpeedToday, setAvgSpeedToday] = useState<number>(0);
  const [route, setRoute] = useState<string>(window.location.hash || "");

  // Controlla se una data è "oggi"
  const isToday = (dateString: string): boolean => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    } catch {
      return false;
    }
  };

  // Carica i trasferimenti di oggi dal backend e calcola media velocità
  const loadTodayStats = async () => {
    try {
      const data = await invoke<BackendTransferRecord[]>('get_recent_transfers');
      
      // Filtra: solo di oggi e completati
      const today = data.filter(r => isToday(r.startTime) && r.status === 'completed');
      
      if (today.length > 0) {
        const sum = today.reduce((acc, r) => acc + (typeof r.speed === 'number' ? r.speed : 0), 0);
        const avg = Math.round((sum / today.length) * 10) / 10;
        setAvgSpeedToday(avg);
      } else {
        setAvgSpeedToday(0);
      }
    } catch (e) {
      // Fallback silenzioso
      setAvgSpeedToday(0);
    }
  };

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Poll today's stats ogni 5s
  useEffect(() => {
    loadTodayStats();
    const id = setInterval(loadTodayStats, 5000);
    return () => clearInterval(id);
  }, []);

  // Ricarica su transfer_complete event
  useEffect(() => {
    let unlistenFn: any;
    (async () => {
      try {
        unlistenFn = await listen('transfer_complete', () => {
          loadTodayStats();
        });
      } catch {}
    })();
    
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const isPrivacy = route === "#/privacy";
  const isTerms = route === "#/terms";

  // Sincronizza tab attiva con hash specifici quando siamo nella vista principale
  useEffect(() => {
    if (!isPrivacy && !isTerms) {
      if (route === "#/transfer") setActiveTab("transfer");
      if (route === "#/devices") setActiveTab("devices");
      if (route === "#/history") setActiveTab("history");
      if (route === "#/settings") setActiveTab("settings");
    }
  }, [route, isPrivacy, isTerms]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 relative overflow-hidden">
      {/* Ambient background orbs for liquid glass effect */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/4 dark:bg-blue-400/2 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-3/4 right-1/4 w-80 h-80 bg-purple-500/4 dark:bg-purple-400/2 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute bottom-1/4 left-1/2 w-64 h-64 bg-pink-500/4 dark:bg-pink-400/2 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>
      
      {/* Header */}
      <header id="app-header" className="border-b backdrop-blur-md bg-background/85 dark:bg-background/70 sticky top-0 z-50 relative">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg shadow-sm">
                <Send className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">AirShare</h1>
                <p className="text-sm text-muted-foreground">{t('app.subtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="gap-2 bg-background/50 dark:bg-background/30 backdrop-blur-sm"
              >
                <Zap className="w-3 h-3 text-green-500" />
                {avgSpeedToday.toFixed(1)} {t('common.mbps')}
              </Badge>
              <Badge
                variant="outline"
                className="gap-1 bg-background/50 dark:bg-background/30 backdrop-blur-sm"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {t('common.online')}
              </Badge>
              <button
                id="start-tour-btn"
                onClick={startTour}
                className="p-2 rounded-full hover:bg-secondary/80 transition-colors"
                title={t('tour.start', 'Start Tour')}
              >
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        {/* Canvas Background */}
        <div className="absolute inset-0 pointer-events-none">
          <CanvasBackground />
        </div>
        {isPrivacy ? (
          <div className="grid lg:grid-cols-3 gap-6 relative z-30">
            <div className="lg:col-span-2 relative z-30">
              <PrivacyPolicy />
            </div>
            <div className="space-y-4 relative z-30">
              <DynamicSidebar
                selectedDevices={selectedDevices}
                context="settings" networkSpeed={0}              />
            </div>
          </div>
        ) : isTerms ? (
          <div className="grid lg:grid-cols-3 gap-6 relative z-30">
            <div className="lg:col-span-2 relative z-30">
              <TermsOfService />
            </div>
            <div className="space-y-4 relative z-30">
              <DynamicSidebar
                  selectedDevices={selectedDevices}
                  context="settings" networkSpeed={0}              />
            </div>
          </div>
        ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6 relative z-20"
        >
          {/* Enhanced Navigation Tabs */}
          <div className="relative">
            <TabsList className="flex w-full lg:w-[950px] h-16 bg-background/80 dark:bg-background/60 backdrop-blur-md border border-border/50 p-1 gap-1">
              <TabsTrigger
                id="tab-transfer"
                value="transfer"
                className="relative overflow-hidden group h-full px-6 py-3 data-[state=active]:bg-transparent flex-1 transition-all duration-300"
              >
                <motion.div
                  className="absolute inset-2 bg-gradient-to-r from-blue-500/25 to-purple-500/25 rounded-lg shadow-sm border border-white/20 dark:border-white/10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{
                    opacity: activeTab === "transfer" ? 1 : 0,
                    scale: activeTab === "transfer" ? 1 : 0.95,
                  }}
                  transition={{
                    duration: 0.3,
                    ease: "easeOut",
                  }}
                />
                <div className="relative z-10 flex items-center justify-center gap-2 transition-transform group-hover:scale-105">
                  <Send className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('tabs.transfer')}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger
                id="tab-devices"
                value="devices"
                className="relative overflow-hidden group h-full px-6 py-3 data-[state=active]:bg-transparent flex-1 transition-all duration-300"
              >
                <motion.div
                  className="absolute inset-2 bg-gradient-to-r from-green-500/25 to-blue-500/25 rounded-lg shadow-sm border border-white/20 dark:border-white/10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{
                    opacity: activeTab === "devices" ? 1 : 0,
                    scale: activeTab === "devices" ? 1 : 0.95,
                  }}
                  transition={{
                    duration: 0.3,
                    ease: "easeOut",
                  }}
                />
                <div className="relative z-10 flex items-center justify-center gap-2 transition-transform group-hover:scale-105">
                  <Wifi className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('tabs.devices')}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger
                id="tab-history"
                value="history"
                className="relative overflow-hidden group h-full px-6 py-3 data-[state=active]:bg-transparent flex-1 transition-all duration-300"
              >
                <motion.div
                  className="absolute inset-2 bg-gradient-to-r from-orange-500/25 to-red-500/25 rounded-lg shadow-sm border border-white/20 dark:border-white/10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{
                    opacity: activeTab === "history" ? 1 : 0,
                    scale: activeTab === "history" ? 1 : 0.95,
                  }}
                  transition={{
                    duration: 0.3,
                    ease: "easeOut",
                  }}
                />
                <div className="relative z-10 flex items-center justify-center gap-2 transition-transform group-hover:scale-105">
                  <History className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('tabs.history')}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger
                id="tab-settings"
                value="settings"
                className="relative overflow-hidden group h-full px-6 py-3 data-[state=active]:bg-transparent flex-1 transition-all duration-300"
              >
                <motion.div
                  className="absolute inset-2 bg-gradient-to-r from-gray-500/25 to-blue-500/25 rounded-lg shadow-sm border border-white/20 dark:border-white/10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{
                    opacity: activeTab === "settings" ? 1 : 0,
                    scale: activeTab === "settings" ? 1 : 0.95,
                  }}
                  transition={{
                    duration: 0.3,
                    ease: "easeOut",
                  }}
                />
                <div className="relative z-10 flex items-center justify-center gap-2 transition-transform group-hover:scale-105">
                  <Settings className="w-4 h-4" />
                  <span className="text-sm font-medium">{t('tabs.settings')}</span>
                </div>
              </TabsTrigger>
            </TabsList>
          </div>

          <AnimatePresence mode="wait">
            {/* Transfer Tab */}
            {activeTab === "transfer" && (
              <TabsContent
                value="transfer"
                className="space-y-6"
              >
                <motion.div
                  key="transfer-content"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{
                    duration: 0.4,
                    ease: "easeInOut",
                  }}
                  className="grid lg:grid-cols-3 gap-6 relative z-30"
                >
                  {/* Main Transfer Area */}
                  <div className="lg:col-span-2 space-y-6 relative z-30">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1, duration: 0.3 }}
                    >
                      <h2 className="text-xl mb-2">{t('transfer.title')}</h2>
                      <p className="text-muted-foreground">{t('transfer.subtitle')}</p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                    >
                      <FileTransfer
                        selectedDevices={selectedDevices}
                        selectedFiles={selectedFiles}
                        onFilesChange={setSelectedFiles}
                      />
                    </motion.div>
                  </div>

                  {/* Dynamic Sidebar */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="space-y-4 relative z-30"
                  >
                    <DynamicSidebar
                            selectedDevices={selectedDevices}
                            context="transfer" networkSpeed={0}                    />
                  </motion.div>
                </motion.div>
              </TabsContent>
            )}

            {/* Devices Tab */}
            {activeTab === "devices" && (
              <TabsContent
                value="devices"
                className="space-y-6"
              >
                <motion.div
                  key="devices-content"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{
                    duration: 0.4,
                    ease: "easeInOut",
                  }}
                  className="grid lg:grid-cols-3 gap-6 relative z-30"
                >
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="lg:col-span-2 relative z-30"
                  >
                    <DeviceDetection
                      onDeviceSelect={setSelectedDevices}
                      selectedDevices={selectedDevices}
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="space-y-4 relative z-30"
                  >
                    <DynamicSidebar
                            selectedDevices={selectedDevices}
                            context="devices" networkSpeed={0}                    />
                  </motion.div>
                </motion.div>
              </TabsContent>
            )}

            {/* Aggiungi questo componente */}
      <AutoAcceptNotification />


            {/* History Tab */}
            {activeTab === "history" && (
              <TabsContent
                value="history"
                className="space-y-6"
              >
                <motion.div
                  key="history-content"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{
                    duration: 0.4,
                    ease: "easeInOut",
                  }}
                  className="grid lg:grid-cols-3 gap-6 relative z-30"
                >
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="lg:col-span-2 relative z-30"
                  >
                    <TransferHistory />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="space-y-4 relative z-30"
                  >
                    <DynamicSidebar
                            selectedDevices={selectedDevices}
                            context="history" networkSpeed={0}                    />
                  </motion.div>
                </motion.div>
              </TabsContent>
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
              <TabsContent
                value="settings"
                className="space-y-6"
              >
                <motion.div
                  key="settings-content"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{
                    duration: 0.4,
                    ease: "easeInOut",
                  }}
                  className="grid lg:grid-cols-3 gap-6 relative z-30"
                >
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="lg:col-span-2 relative z-30"
                  >
                    <SettingsComponent />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="space-y-4 relative z-30"
                  >
                    <DynamicSidebar
                            selectedDevices={selectedDevices}
                            context="settings" networkSpeed={0}                    />
                  </motion.div>
                </motion.div>
              </TabsContent>
            )}
          </AnimatePresence>
        </Tabs>
        )}
      </main>
      {/* Mount global TransferPrompt listener */}
      <TransferPrompt />
      {/* Mount global TransferNotification listener */}
      <TransferNotification />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
