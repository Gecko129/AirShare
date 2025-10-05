import { Monitor, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Badge } from './ui/badge';
import type { Device as SharedDevice } from '../types/device';

interface DeviceCardProps {
  device: SharedDevice;
  onSelect?: (device: SharedDevice) => void;
  selected?: boolean;
}

const deviceIcons: Record<string, any> = {
  windows: Monitor,
  macos: Monitor,
  linux: Monitor,
  iphone: Smartphone,
  android: Smartphone,
};

const deviceLabels: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  iphone: 'iPhone',
  android: 'Android',
  other: 'Dispositivo',
};

export function DeviceCard({ device, onSelect, selected = false }: DeviceCardProps) {
  const Icon = deviceIcons[device.type || 'other'] || Monitor;
  
  return (
    <GlassCard 
      intensity={selected ? 'strong' : 'medium'}
      className={`p-4 cursor-pointer transition-all hover:scale-[1.02] ${
        selected 
          ? 'ring-2 ring-primary shadow-lg shadow-primary/20' 
          : 'hover:shadow-md'
      }`}
      onClick={() => onSelect?.(device)}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-background border">
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="truncate">{device.name}</h3>
            <Badge variant={(device.status === 'online') ? 'default' : 'secondary'} className="text-xs">
              {device.status === 'online' ? (
                <Wifi className="w-3 h-3 mr-1" />
              ) : (
                <WifiOff className="w-3 h-3 mr-1" />
              )}
              {device.status || 'offline'}
            </Badge>
          </div>
          
          <p className="text-muted-foreground text-sm">
            {deviceLabels[device.type || 'other']}
            {(device.ipAddress || device.ip) && `  ${device.ipAddress || device.ip}`}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
 