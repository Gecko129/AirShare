import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { DeviceList } from './components/DeviceList';
import { FileTransfer } from './components/FileTransfer';
import { Waves, Zap } from 'lucide-react';
import { TransferPrompt } from './components/TransferPrompt';
import LanguageSwitcher from './components/LanguageSwitcher';
import './i18n';

export default function App() {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

  const { t } = useTranslation();

  const handleDeviceSelectionChange = (deviceIds: string[]) => {
    setSelectedDevices(deviceIds);
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
              <h1 className="text-4xl text-gray-100 mb-2">AirShare</h1>
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
      <TransferPrompt />
      {/* Language Switcher - fixed bottom left */}
      <div className="fixed bottom-4 left-4 z-50">
        <LanguageSwitcher />
      </div>
    </div>
  );
}
