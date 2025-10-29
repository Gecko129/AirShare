import { useState, useEffect } from 'react';
import { Wifi, RefreshCw, Search, X } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DeviceCard } from './DeviceCard';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import type { Device as SharedDevice } from '../types/device';

interface Device {
  id: string;
  name: string;
  ip: string;
  last_seen: number; // epoch seconds
  type: 'windows' | 'macos' | 'linux' | 'iphone' | 'android' | 'other';
  status: 'online' | 'offline';
  ipAddress?: string;
}

interface DeviceDetectionProps {
  onDeviceSelect: (devices: SharedDevice[]) => void;
  selectedDevices: SharedDevice[];
}



// Helper function to check if device is online (within last 30 seconds)
const isDeviceOnline = (lastSeen?: string | number): boolean => {
  const now = Math.floor(Date.now() / 1000);
  const ls = typeof lastSeen === 'string' ? Math.floor(new Date(lastSeen).getTime() / 1000) : (typeof lastSeen === 'number' ? lastSeen : now);
  return (now - ls) < 30;
};

export function DeviceDetection({ onDeviceSelect, selectedDevices }: DeviceDetectionProps) {
  const [devices, setDevices] = useState<SharedDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const scanForDevices = async () => {
    setIsScanning(true);
    
    try {
      // Call the real Tauri backend function
      const backendDevices = await invoke<any[]>('get_devices');
      // Normalize devices coming from Rust side
  const normalized = backendDevices.map((d) => {
        const name = d.name || d.ip || 'Dispositivo';
        const lower = String(name).toLowerCase();
        let type: Device['type'] = 'other';
        if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) type = 'iphone';
        else if (lower.includes('android')) type = 'android';
        else if (lower.includes('mac') || lower.includes('macbook') || lower.includes('darwin')) type = 'macos';
        else if (lower.includes('win') || lower.includes('windows')) type = 'windows';
        else if (lower.includes('linux')) type = 'linux';

        const lastSeenEpoch = d.last_seen ? Math.floor(new Date(d.last_seen).getTime() / 1000) : Math.floor(Date.now() / 1000);
        const status: Device['status'] = isDeviceOnline(lastSeenEpoch) ? 'online' : 'offline';

        return {
          id: d.ip || d.name || `${d.ip}:${d.port}`,
          name,
          ip: d.ip,
          last_seen: lastSeenEpoch,
          lastSeenEpoch,
          type,
          status,
          ipAddress: d.ip,
          port: d.port,
        } as SharedDevice;
      });
      setDevices(normalized);
    } catch (error) {
      console.error('Error fetching devices:', error);
      // Fallback to empty array on error
      setDevices([]);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    scanForDevices();
  }, []);

  const filteredDevices = devices.filter(device =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.ip.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const onlineDevices = filteredDevices.filter(device => isDeviceOnline(device.last_seen));
  const offlineDevices = filteredDevices.filter(device => !isDeviceOnline(device.last_seen));

  const handleDeviceSelect = (device: SharedDevice) => {
    if (isDeviceOnline(device.last_seen)) {
      const isSelected = selectedDevices.some(d => d.id === device.id);
      if (isSelected) {
        onDeviceSelect(selectedDevices.filter(d => d.id !== device.id));
      } else {
        onDeviceSelect([...selectedDevices, device]);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: isScanning ? 360 : 0 }}
            transition={{ duration: 2, repeat: isScanning ? Infinity : 0, ease: 'linear' }}
          >
            <Wifi className="w-5 h-5" />
          </motion.div>
          <div>
            <h2>Dispositivi Disponibili</h2>
            <AnimatePresence>
              {selectedDevices.length > 0 && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-primary mt-1"
                >
                  {selectedDevices.length} dispositivo{selectedDevices.length > 1 ? 'i' : ''} selezionato{selectedDevices.length > 1 ? 'i' : ''}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <div className="flex gap-2">
          <AnimatePresence>
            {selectedDevices.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => onDeviceSelect([])}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Deseleziona Tutti
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button 
              variant="outline" 
              size="sm" 
              onClick={scanForDevices}
              disabled={isScanning}
            >
              {isScanning ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {isScanning ? 'Ricerca...' : 'Aggiorna'}
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Cerca dispositivi..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Scanning State */}
      {isScanning && devices.length === 0 && (
        <GlassCard className="p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
          <h3>Ricerca dispositivi in corso...</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Scansione della rete locale per dispositivi AirShare
          </p>
        </GlassCard>
      )}

      {/* Online Devices */}
      <AnimatePresence>
        {onlineDevices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="mb-3 text-green-600">
              Online ({onlineDevices.length})
            </h3>
            <div className="grid gap-3">
              {onlineDevices.map((device, index) => (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.3 }}
                >
                  <DeviceCard
                    device={device}
                    onSelect={handleDeviceSelect}
                    selected={selectedDevices.some(d => d.id === device.id)}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Devices */}
      <AnimatePresence>
        {offlineDevices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <h3 className="mb-3 text-muted-foreground">
              Offline ({offlineDevices.length})
            </h3>
            <div className="grid gap-3">
              {offlineDevices.map((device, index) => (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
                >
                  <DeviceCard
                    device={device}
                    onSelect={() => {}} // Disabled for offline devices
                    selected={false}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Devices Found */}
      {!isScanning && devices.length === 0 && (
        <GlassCard className="p-8 text-center">
          <Wifi className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <h3>Nessun dispositivo trovato</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Assicurati che i dispositivi siano sulla stessa rete e abbiano AirShare installato
          </p>
        </GlassCard>
      )}

      {/* No Search Results */}
      {!isScanning && devices.length > 0 && filteredDevices.length === 0 && (
        <GlassCard className="p-8 text-center">
          <Search className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <h3>Nessun risultato trovato</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Prova a modificare i termini di ricerca
          </p>
        </GlassCard>
      )}
    </div>
  );
}