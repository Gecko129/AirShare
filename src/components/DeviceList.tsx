import { useState, useEffect, useMemo } from 'react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Wifi, Smartphone, Laptop, Monitor, Router, Zap } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Device {
  id: string;
  name: string;
  ip: string;
  mac: string;
  type: 'phone' | 'laptop' | 'desktop' | 'router' | 'other';
  status: 'online' | 'offline';
  airshareActive: boolean;
  lastSeen: string;
  version: string;
  stability: number;
}

interface DeviceListProps {
  selectedDevices: string[];
  onSelectionChange: (deviceIds: string[]) => void;
}

const getDeviceIcon = (type: Device['type']) => {
  switch (type) {
    case 'phone':
      return <Smartphone className="w-5 h-5 text-gray-300" />;
    case 'laptop':
      return <Laptop className="w-5 h-5 text-gray-300" />;
    case 'desktop':
      return <Monitor className="w-5 h-5 text-gray-300" />;
    case 'router':
      return <Router className="w-5 h-5 text-gray-300" />;
    default:
      return <Wifi className="w-5 h-5 text-gray-300" />;
  }
};

const guessDeviceType = (name: string): Device['type'] => {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('ipad') || lowerName.includes('iphone') || lowerName.includes('android')) {
    return 'phone';
  }
  if (lowerName.includes('macbook') || lowerName.includes('laptop') || lowerName.includes('dell')) {
    return 'laptop';
  }
  if (lowerName.includes('imac') || lowerName.includes('desktop') || lowerName.includes('pc')) {
    return 'desktop';
  }
  if (lowerName.includes('router') || lowerName.includes('gateway')) {
    return 'router';
  }

  return 'other';
};

export function DeviceList({ selectedDevices, onSelectionChange }: DeviceListProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  // Funzione che chiama il backend Rust tramite Tauri per ottenere la lista dispositivi
  useEffect(() => {
    console.log('Tauri API disponibile:', window.__TAURI__);
    console.log('Versione Tauri:', window.__TAURI_METADATA__);
    console.log('Invoke disponibile:', typeof invoke);

    async function fetchDevices() {
      try {
        const devs = await invoke<Device[]>('get_devices');
        console.log('[DeviceList] Dati grezzi dal backend:', devs);

        const mappedDevices = devs.map(d => ({
          id: d.id || d.ip,
          name: d.name || 'Dispositivo sconosciuto',
          ip: d.ip,
          mac: d.mac || '00:00:00:00:00:00',
          type: guessDeviceType(d.name) || d.type || 'other',
          status: 'online' as const, // Forza online per ora
          airshareActive: true, // Forza true per ora
          lastSeen: d.lastSeen || 'ora',
          version: d.version || '1.0.0',
          stability: d.stability !== undefined ? d.stability : 1,
        }));

        console.log(`[DeviceList] Dispositivi dopo mapping (${mappedDevices.length}):`, mappedDevices);
        mappedDevices.forEach((device, index) => {
          console.log(`Dispositivo ${index}:`, {
            name: device.name,
            status: device.status,
            airshareActive: device.airshareActive,
            type: device.type
          });
        });

        setDevices(mappedDevices);
      } catch (error) {
        if (error instanceof Error) {
          console.error('[DeviceList] Errore fetch dispositivi:', error.message, error.stack);
        } else {
          console.error('[DeviceList] Errore fetch dispositivi:', error);
        }
      }
    }

    fetchDevices();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  // Calcola il padding dinamico in base alla lunghezza del nome più lungo
  const dynamicLayout = useMemo(() => {
    // Mostra TUTTI i dispositivi per ora
    const airshareDevices = devices;

    if (airshareDevices.length === 0) return { containerPadding: 'px-8', itemSpacing: 'gap-8' };

    const maxNameLength = Math.max(...airshareDevices.map(device => device.name.length));

    if (maxNameLength > 20) {
      return {
        containerPadding: 'px-10',
        itemSpacing: 'gap-10',
        nameContainer: 'min-w-[280px]'
      };
    } else if (maxNameLength > 15) {
      return {
        containerPadding: 'px-9',
        itemSpacing: 'gap-9',
        nameContainer: 'min-w-[240px]'
      };
    } else {
      return {
        containerPadding: 'px-8',
        itemSpacing: 'gap-8',
        nameContainer: 'min-w-[200px]'
      };
    }
  }, [devices]);

  // Mostra TUTTI i dispositivi per ora (rimuovi il filtro)
  const airshareDevices = devices;

  console.log(`[DeviceList] Tutti i dispositivi (${devices.length}):`, devices);
  console.log(`[DeviceList] Dispositivi da mostrare (${airshareDevices.length}):`, airshareDevices);

  const handleDeviceToggle = (deviceId: string, checked: boolean) => {
    const newSelection = checked
      ? [...selectedDevices, deviceId]
      : selectedDevices.filter(id => id !== deviceId);

    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedDevices.length === airshareDevices.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(airshareDevices.map(device => device.id));
    }
  };

  return (
    <Card className="backdrop-blur-md bg-gray-900/40 border border-gray-700/50 shadow-2xl p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-gradient-to-r from-gray-700/40 to-slate-600/40 backdrop-blur-sm">
            <Zap className="w-6 h-6 text-gray-200" />
          </div>
          <div>
            <h2 className="text-gray-100">Dispositivi Rilevati</h2>
            <p className="text-gray-400 text-sm">{airshareDevices.length} dispositivi disponibili</p>
          </div>
        </div>

        {airshareDevices.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 rounded-lg bg-gray-800/60 text-gray-300 hover:bg-gray-700/80 transition-colors text-sm border border-gray-600/40 flex-shrink-0"
            type="button"
          >
            {selectedDevices.length === airshareDevices.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
          </button>
        )}
      </div>

      {airshareDevices.length === 0 ? (
        <div className="text-center py-8">
          <div className="p-4 rounded-full bg-gray-800/30 w-fit mx-auto mb-4">
            <Zap className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-gray-400">Nessun dispositivo rilevato</p>
          <p className="text-gray-500 text-sm mt-1">Scansione della rete in corso...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {airshareDevices.map((device) => (
            <div
              key={device.id}
              className={`py-8 ${dynamicLayout.containerPadding} rounded-xl backdrop-blur-sm transition-all duration-300 border min-h-[120px] ${
                selectedDevices.includes(device.id)
                  ? 'bg-slate-700/40 border-slate-500/60 shadow-lg shadow-slate-500/10'
                  : 'bg-gray-800/20 border-gray-700/30 hover:bg-gray-800/40'
              }`}
            >
              <div className={`flex items-center ${dynamicLayout.itemSpacing} h-full`}>
                <div className="flex-shrink-0">
                  <Checkbox
                    checked={selectedDevices.includes(device.id)}
                    onCheckedChange={(checked) => handleDeviceToggle(device.id, Boolean(checked))}
                    className="border-gray-500/50 data-[state=checked]:bg-slate-600 data-[state=checked]:border-slate-500"
                  />
                </div>

                <div className={`flex-shrink-0 p-3 rounded-lg ${
                  device.status === 'online' ? 'bg-green-500/20' : 'bg-gray-600/20'
                }`}>
                  {getDeviceIcon(device.type)}
                </div>

                <div className={`flex-1 ${dynamicLayout.nameContainer || 'min-w-0'}`}>
                  <div className="mb-2">
                    <h3 className="text-gray-100 text-base leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                      {device.name}
                    </h3>
                  </div>
                  <p className="text-gray-400 text-sm">{device.ip}</p>
                </div>

                <div className="flex-shrink-0 flex flex-col items-end gap-3 min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <Badge className={`${
                      device.status === 'online'
                        ? 'bg-green-500/20 text-green-200 border-green-500/40'
                        : 'bg-gray-500/20 text-gray-200 border-gray-500/40'
                    } text-xs whitespace-nowrap`}>
                      {device.status === 'online' ? 'Online' : 'Offline'}
                    </Badge>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/40 border border-slate-600/40">
                      <Zap className="w-3 h-3 text-slate-300" />
                      <span className="text-slate-200 text-xs">Rilevato</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedDevice(expandedDevice === device.id ? null : device.id)}
                    className="text-gray-500 hover:text-gray-300 text-xs transition-colors whitespace-nowrap"
                    type="button"
                  >
                    {device.lastSeen}
                  </button>
                </div>
              </div>

              {expandedDevice === device.id && (
                <div className="mt-6 pt-4 border-t border-gray-700/40">
                  <div className="grid grid-cols-2 gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">MAC:</span>
                      <span className="text-gray-400 ml-2 break-all">{device.mac}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Versione:</span>
                      <span className="text-gray-400 ml-2">v{device.version}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}