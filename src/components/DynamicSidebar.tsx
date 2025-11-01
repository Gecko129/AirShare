import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from './GlassCard';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  Wifi, 
  Smartphone, 
  Monitor, 
  Zap, 
  Shield, 
  Clock, 
  Share2, 
  Cpu,
  HardDrive,
  BarChart3,
  Lightbulb,
  TrendingUp,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface DynamicSidebarProps {
  selectedDevices: any[];
  networkSpeed: number;
  avgSpeedToday?: number;
  context: 'transfer' | 'devices' | 'history' | 'qr' | 'settings';
}

interface TipContent {
  icon: React.ReactNode;
  title: string;
  content: string[];
}

interface StatsContent {
  icon: React.ReactNode;
  title: string;
  value: string;
  trend?: 'up' | 'down' | 'stable';
}

export function DynamicSidebar({ selectedDevices, networkSpeed, context }: DynamicSidebarProps) {
  const { t } = useTranslation();
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [currentStatsIndex, setCurrentStatsIndex] = useState(0);
  const [cpuUsage] = useState(Math.floor(Math.random() * 40) + 20);
  const [memoryUsage] = useState(Math.floor(Math.random() * 30) + 40);
  const [avgSpeedToday, setAvgSpeedToday] = useState<number>(0);
  const [transfersTodayCount, setTransfersTodayCount] = useState<number>(0);

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

  const selectedDeviceKeys = useMemo(() => {
    const names = new Set<string>();
    const ips = new Set<string>();
    (selectedDevices || []).forEach(d => {
      if (d?.name) names.add(String(d.name));
      if (d?.ip || d?.ipAddress) ips.add(String(d.ip || d.ipAddress));
    });
    return { names, ips };
  }, [selectedDevices]);

  const isToday = (date: Date) => {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  };

  const computeTodayStats = (records: BackendTransferRecord[]) => {
    const relevant = records.filter(r => {
      const dt = new Date(r.startTime);
      if (!isToday(dt)) return false;
      const involvesSelected =
        selectedDeviceKeys.names.has(r.fromDevice) ||
        selectedDeviceKeys.names.has(r.toDevice) ||
        selectedDeviceKeys.ips.has(r.fromDevice) ||
        selectedDeviceKeys.ips.has(r.toDevice);
      return involvesSelected;
    });

    const completed = relevant.filter(r => r.status === 'completed');
    const count = completed.length;
    const avg = count > 0
      ? completed.reduce((acc, r) => acc + (typeof r.speed === 'number' ? r.speed : 0), 0) / count
      : 0;

    setTransfersTodayCount(count);
    setAvgSpeedToday(avg);
  };

  const loadRecentTransfers = async () => {
    try {
      const data = await invoke<BackendTransferRecord[]>('get_recent_transfers');
      computeTodayStats(data);
    } catch (e) {
      // fail-silent
    }
  };

  const getTips = (): TipContent[] => {
    const baseTips: TipContent[] = [
      {
        icon: <Zap className="w-4 h-4" />,
        title: t('sidebar.tips.optimization.title'),
        content: [
          t('sidebar.tips.optimization.item1'),
          t('sidebar.tips.optimization.item2'),
          t('sidebar.tips.optimization.item3')
        ]
      },
      {
        icon: <Shield className="w-4 h-4" />,
        title: t('sidebar.tips.security.title'),
        content: [
          t('sidebar.tips.security.item1'),
          t('sidebar.tips.security.item2'),
          t('sidebar.tips.security.item3')
        ]
      },
      {
        icon: <Clock className="w-4 h-4" />,
        title: t('sidebar.tips.speed.title'),
        content: [
          t('sidebar.tips.speed.item1'),
          t('sidebar.tips.speed.item2'),
          t('sidebar.tips.speed.item3')
        ]
      }
    ];

    const contextSpecificTips: Record<string, TipContent> = {
      transfer: {
        icon: <Share2 className="w-4 h-4" />,
        title: t('sidebar.tips.transfer.title'),
        content: [
          t('sidebar.tips.transfer.item1'),
          t('sidebar.tips.transfer.item2'),
          t('sidebar.tips.transfer.item3')
        ]
      },
      devices: {
        icon: <Wifi className="w-4 h-4" />,
        title: t('sidebar.tips.devices.title'),
        content: [
          t('sidebar.tips.devices.item1'),
          t('sidebar.tips.devices.item2'),
          t('sidebar.tips.devices.item3')
        ]
      },
      history: {
        icon: <BarChart3 className="w-4 h-4" />,
        title: t('sidebar.tips.history.title'),
        content: [
          t('sidebar.tips.history.item1'),
          t('sidebar.tips.history.item2'),
          t('sidebar.tips.history.item3')
        ]
      },
      qr: {
        icon: <Share2 className="w-4 h-4" />,
        title: t('sidebar.tips.qr.title'),
        content: [
          t('sidebar.tips.qr.item1'),
          t('sidebar.tips.qr.item2'),
          t('sidebar.tips.qr.item3')
        ]
      },
      settings: {
        icon: <Lightbulb className="w-4 h-4" />,
        title: t('sidebar.tips.settings.title'),
        content: [
          t('sidebar.tips.settings.item1'),
          t('sidebar.tips.settings.item2'),
          t('sidebar.tips.settings.item3'),
        ]
      }
    };

    const specificTip = contextSpecificTips[context];
    return specificTip ? [specificTip, ...baseTips] : baseTips;
  };

  const getStats = (): StatsContent[] => {
    const speedTrend: 'up' | 'down' | 'stable' =
      avgSpeedToday === 0 && networkSpeed === 0
        ? 'stable'
        : avgSpeedToday >= networkSpeed
        ? 'up'
        : 'down';
    return [
      {
        icon: <Activity className="w-4 h-4" />,
        title: t('sidebar.stats.transfers'),
        value: String(transfersTodayCount),
        trend: 'stable'
      },
      {
        icon: <TrendingUp className="w-4 h-4" />,
        title: t('sidebar.stats.avg_speed'),
        value: `${avgSpeedToday.toFixed(1)} MB/s`,
        trend: speedTrend
      },
      {
        icon: <Cpu className="w-4 h-4" />,
        title: t('sidebar.stats.cpu'),
        value: `${cpuUsage}%`,
        trend: cpuUsage > 60 ? 'up' : 'stable'
      },
      {
        icon: <HardDrive className="w-4 h-4" />,
        title: t('sidebar.stats.memory'),
        value: `${memoryUsage}%`,
        trend: memoryUsage > 70 ? 'up' : 'stable'
      }
    ];
  };

  const tips = getTips();
  const stats = getStats();

  // Rotate tips every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % tips.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [tips.length]);

  // Rotate stats every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStatsIndex((prev) => (prev + 1) % stats.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [stats.length]);

  // Carica dati e aggiorna su eventi di completamento; ricalcola quando cambia la selezione
  useEffect(() => {
    loadRecentTransfers();
    let unlisten: undefined | (() => void);
    (async () => {
      try {
        unlisten = await listen('transfer_complete', () => {
          loadRecentTransfers();
        });
      } catch {}
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [selectedDeviceKeys.names, selectedDeviceKeys.ips]);

  const getTrendColor = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Selected Devices */}
      <GlassCard className="p-4">
        <h3 className="mb-3">{t('sidebar.selected_devices')}</h3> 
        {selectedDevices.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedDevices.map((device, index) => (
              <motion.div
                key={device.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3 p-3 bg-accent/50 rounded-lg border border-border/50"
              >
                <div className="p-2 bg-background rounded border">
                  {device.type === 'iphone' || device.type === 'android' ? (
                    <Smartphone className="w-4 h-4" />
                  ) : (
                    <Monitor className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{device.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {device.ipAddress}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1" />
                  {t('common.connected')}
                </Badge>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Wifi className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('sidebar.no_selected_devices')}</p>
          </div>
        )}
      </GlassCard>

      {/* Dynamic Stats */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3>{t('sidebar.live_stats')}</h3>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </div>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStatsIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stats[currentStatsIndex].icon}
                <span className="text-sm">{stats[currentStatsIndex].title}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`font-medium ${getTrendColor(stats[currentStatsIndex].trend)}`}>
                  {stats[currentStatsIndex].value}
                </span>
                {stats[currentStatsIndex].trend === 'up' && (
                  <TrendingUp className="w-3 h-3 text-green-500" />
                )}
              </div>
            </div>
            
            {/* Mini progress bars for CPU and Memory */}
            {(stats[currentStatsIndex].title === 'CPU Usage' || stats[currentStatsIndex].title === 'Memory') && (
              <Progress 
                value={parseInt(stats[currentStatsIndex].value)} 
                className="h-2"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Stats dots indicator */}
        <div className="flex justify-center gap-1 mt-3">
          {stats.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStatsIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentStatsIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </GlassCard>

      {/* Dynamic Tips */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3>{t('sidebar.pro_tips')}</h3>
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.8, 1, 0.8]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
          >
            <Lightbulb className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />
          </motion.div>
        </div>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTipIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                key={currentTipIndex}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
                className="text-primary"
              >
                {tips[currentTipIndex].icon}
              </motion.div>
              <h4 className="font-medium text-sm">{tips[currentTipIndex].title}</h4>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {tips[currentTipIndex].content.map((tip, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.3 }}
                  className="flex items-start gap-2"
                >
                  <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                  <span className="leading-relaxed">{tip}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Tip indicators */}
        <div className="flex justify-center gap-1 mt-4">
          {tips.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentTipIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentTipIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </GlassCard>

    </div>
  );
}