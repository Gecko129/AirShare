import { useState, useEffect, useMemo } from 'react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Wifi, Smartphone, Laptop, Monitor, Router, Zap } from 'lucide-react';

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

// Mock data per simulare dispositivi con AirShare attivo
const initialDevices: Device[] = [
  { 
    id: '1', 
    name: 'iPhone di Marco', 
    ip: '192.168.1.101', 
    mac: '00:1B:44:11:3A:B7', 
    type: 'phone', 
    status: 'online', 
    airshareActive: true,
    lastSeen: 'ora',
    version: '2.1.0',
    stability: 0.95
  },
  { 
    id: '2', 
    name: 'MacBook Pro', 
    ip: '192.168.1.102', 
    mac: '00:1B:44:11:3A:B8', 
    type: 'laptop', 
    status: 'online', 
    airshareActive: true,
    lastSeen: 'ora',
    version: '2.1.0',
    stability: 0.98
  },
  { 
    id: '3', 
    name: 'PC Desktop Gaming', 
    ip: '192.168.1.103', 
    mac: '00:1B:44:11:3A:C0', 
    type: 'desktop', 
    status: 'online', 
    airshareActive: true,
    lastSeen: 'ora',
    version: '2.0.5',
    stability: 0.92
  },
  { 
    id: '4', 
    name: 'Samsung Galaxy S23', 
    ip: '192.168.1.104', 
    mac: '00:1B:44:11:3A:C1', 
    type: 'phone', 
    status: 'online', 
    airshareActive: true,
    lastSeen: '30 sec fa',
    version: '2.1.0',
    stability: 0.90
  },
];

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

export function DeviceList({ selectedDevices, onSelectionChange }: DeviceListProps) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  // Calcola il padding dinamico in base alla lunghezza del nome più lungo
  const dynamicLayout = useMemo(() => {
    const airshareDevices = devices.filter(device => device.airshareActive && device.status === 'online');
    
    if (airshareDevices.length === 0) return { containerPadding: 'px-8', itemSpacing: 'gap-8' };
    
    const maxNameLength = Math.max(...airshareDevices.map(device => device.name.length));
    
    // Calcolazioni dinamiche basate sulla lunghezza dei nomi
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

  // Simula aggiornamenti in tempo reale più stabili
  useEffect(() => {
    const interval = setInterval(() => {
      setDevices(prevDevices => {
        return prevDevices.map(device => {
          // Usa la stabilità del dispositivo per determinare se rimane online
          const staysOnline = Math.random() < device.stability;
          const currentStatus = staysOnline ? 'online' : 'offline';
          
          // AirShare rimane attivo se il dispositivo è online
          const airshareStaysActive = currentStatus === 'online' ? (Math.random() > 0.02) : false;
          
          // Aggiorna lastSeen solo se cambiano stati
          let newLastSeen = device.lastSeen;
          if (currentStatus === 'online' && device.status === 'offline') {
            newLastSeen = 'ora';
          } else if (currentStatus === 'online') {
            // Aggiorna occasionalmente il tempo per dispositivi online
            if (Math.random() > 0.8) {
              const timeOptions = ['ora', '30 sec fa', '1 min fa', '2 min fa'];
              newLastSeen = timeOptions[Math.floor(Math.random() * timeOptions.length)];
            }
          }

          return {
            ...device,
            status: currentStatus,
            airshareActive: airshareStaysActive,
            lastSeen: newLastSeen
          };
        });
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Filtra solo dispositivi con AirShare attivo
  const airshareDevices = devices.filter(device => device.airshareActive && device.status === 'online');

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
            <h2 className="text-gray-100">Dispositivi AirShare</h2>
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
          <p className="text-gray-400">Nessun dispositivo AirShare rilevato</p>
          <p className="text-gray-500 text-sm mt-1">Assicurati che AirShare sia attivo sui dispositivi</p>
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
                {/* Checkbox - Allineata al centro */}
                <div className="flex-shrink-0">
                  <Checkbox
                    checked={selectedDevices.includes(device.id)}
                    onCheckedChange={(checked) => handleDeviceToggle(device.id, Boolean(checked))}
                    className="border-gray-500/50 data-[state=checked]:bg-slate-600 data-[state=checked]:border-slate-500"
                  />
                </div>

                {/* Device Icon - Allineata al centro */}
                <div className={`flex-shrink-0 p-3 rounded-lg ${
                  device.status === 'online' ? 'bg-green-500/20' : 'bg-gray-600/20'
                }`}>
                  {getDeviceIcon(device.type)}
                </div>

                {/* Device Info - Centrata verticalmente */}
                <div className={`flex-1 ${dynamicLayout.nameContainer || 'min-w-0'}`}>
                  <div className="mb-2">
                    <h3 className="text-gray-100 text-base leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                      {device.name}
                    </h3>
                  </div>
                  <p className="text-gray-400 text-sm">{device.ip}</p>
                </div>

                {/* Status and Actions - Allineata al centro */}
                <div className="flex-shrink-0 flex flex-col items-end gap-3 min-w-[140px]">
                  {/* Tags aligned vertically */}
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/20 text-green-200 border-green-500/40 text-xs whitespace-nowrap">
                      Online
                    </Badge>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/40 border border-slate-600/40">
                      <Zap className="w-3 h-3 text-slate-300" />
                      <span className="text-slate-200 text-xs">AirShare</span>
                    </div>
                  </div>
                  
                  {/* Last seen button */}
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
