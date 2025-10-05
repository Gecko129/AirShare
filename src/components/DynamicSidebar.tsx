import { useState, useEffect } from 'react';
import { GlassCard } from './GlassCard';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { 
  Wifi, 
  Smartphone, 
  Monitor, 
  Zap, 
  Shield, 
  Clock, 
  Archive, 
  Share2, 
  Download, 
  Upload,
  Cpu,
  HardDrive,
  BarChart3,
  Lightbulb,
  TrendingUp,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DynamicSidebarProps {
  selectedDevices: any[];
  networkSpeed: number;
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
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [currentStatsIndex, setCurrentStatsIndex] = useState(0);
  const [cpuUsage] = useState(Math.floor(Math.random() * 40) + 20);
  const [memoryUsage] = useState(Math.floor(Math.random() * 30) + 40);

  // Dynamic tips based on context
  const getTips = (): TipContent[] => {
    const baseTips = [
      {
        icon: <Zap className="w-4 h-4" />,
        title: "Ottimizzazione Velocità",
        content: [
          "• Chiudi le app non necessarie",
          "• Usa cavo ethernet se possibile", 
          "• Comprimi file grandi prima del trasferimento",
          "• Evita altre attività di rete"
        ]
      },
      {
        icon: <Shield className="w-4 h-4" />,
        title: "Sicurezza Avanzata",
        content: [
          "• Crittografia AES-256 end-to-end",
          "• Verifica fingerprint dispositivi",
          "• Nessun dato passa per server esterni",
          "• Autenticazione biometrica disponibile"
        ]
      },
      {
        icon: <Archive className="w-4 h-4" />,
        title: "Compressione Intelligente",
        content: [
          "• Compressione automatica per immagini",
          "• Algoritmi ottimizzati per video",
          "• Risparmio fino al 70% di tempo",
          "• Qualità preservata"
        ]
      },
      {
        icon: <Clock className="w-4 h-4" />,
        title: "Trasferimenti Programmati",
        content: [
          "• Programma trasferimenti notturni",
          "• Code intelligenti per file grandi",
          "• Pausa/ripresa automatica",
          "• Sincronizzazione bidirezionale"
        ]
      }
    ];

    const contextTips: Record<string, TipContent[]> = {
      transfer: [
        {
          icon: <Share2 className="w-4 h-4" />,
          title: "Drag & Drop Avanzato",
          content: [
            "• Trascina cartelle intere",
            "• Anteprima automatica immagini",
            "• Supporto per 500+ formati",
            "• Gestione conflitti nomi file"
          ]
        },
        ...baseTips
      ],
      devices: [
        {
          icon: <Wifi className="w-4 h-4" />,
          title: "Rilevamento Intelligente",
          content: [
            "• Scansione automatica rete",
            "• Cache dispositivi fidati",
            "• Wake-on-LAN per PC",
            "• Hotspot mobile supportato"
          ]
        },
        ...baseTips
      ],
      history: [
        {
          icon: <BarChart3 className="w-4 h-4" />,
          title: "Analytics Dettagliati",
          content: [
            "• Statistiche velocità per dispositivo",
            "• Analisi pattern di utilizzo",
            "• Report mensili automatici",
            "• Backup cronologia cloud"
          ]
        },
        ...baseTips
      ],
      qr: [
        {
          icon: <Share2 className="w-4 h-4" />,
          title: "Connessioni Rapide",
          content: [
            "• QR codes con scadenza temporale",
            "• Condivisione guest temporanea",
            "• Link di invito monouso",
            "• Connessioni automatiche WiFi"
          ]
        },
        ...baseTips
      ],
      settings: [
        {
          icon: <Lightbulb className="w-4 h-4" />,
          title: "Personalizzazione",
          content: [
            "• Temi personalizzati",
            "• Shortcuts personalizzabili",
            "• Notifiche intelligenti",
            "• Automazioni avanzate"
          ]
        },
        ...baseTips
      ]
    };

    return contextTips[context] || baseTips;
  };

  const getStats = (): StatsContent[] => {
    return [
      {
        icon: <Download className="w-4 h-4" />,
        title: "Download Oggi",
        value: "2.4 GB",
        trend: 'up'
      },
      {
        icon: <Upload className="w-4 h-4" />,
        title: "Upload Oggi", 
        value: "1.8 GB",
        trend: 'up'
      },
      {
        icon: <Activity className="w-4 h-4" />,
        title: "Trasferimenti",
        value: "47",
        trend: 'stable'
      },
      {
        icon: <TrendingUp className="w-4 h-4" />,
        title: "Velocità Media",
        value: `${networkSpeed} MB/s`,
        trend: 'up'
      },
      {
        icon: <Cpu className="w-4 h-4" />,
        title: "CPU Usage",
        value: `${cpuUsage}%`,
        trend: cpuUsage > 60 ? 'up' : 'stable'
      },
      {
        icon: <HardDrive className="w-4 h-4" />,
        title: "Memory",
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
    }, 3000);
    return () => clearInterval(interval);
  }, [stats.length]);

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
        <h3 className="mb-3">Dispositivi Selezionati</h3>
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
                  Connesso
                </Badge>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Wifi className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nessun dispositivo selezionato</p>
          </div>
        )}
      </GlassCard>

      {/* Dynamic Stats */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3>Statistiche Live</h3>
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
          <h3>Suggerimenti Pro</h3>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            <Lightbulb className="w-4 h-4 text-yellow-500" />
          </motion.div>
        </div>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTipIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-2 mb-2">
              {tips[currentTipIndex].icon}
              <h4 className="font-medium text-sm">{tips[currentTipIndex].title}</h4>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {tips[currentTipIndex].content.map((tip, index) => (
                <motion.p
                  key={index}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {tip}
                </motion.p>
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

      {/* Quick Actions based on context */}
      <GlassCard className="p-4">
        <h3 className="mb-3">Azioni Rapide</h3>
        <div className="space-y-2">
          {context === 'transfer' && (
            <>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Archive className="w-4 h-4" />
                Comprimi File
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Clock className="w-4 h-4" />
                Programma Trasferimento
              </Button>
            </>
          )}
          
          {context === 'devices' && (
            <>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Wifi className="w-4 h-4" />
                Scansiona Rete
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Share2 className="w-4 h-4" />
                Invita Dispositivo
              </Button>
            </>
          )}

          {context === 'history' && (
            <>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Download className="w-4 h-4" />
                Esporta Report
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <BarChart3 className="w-4 h-4" />
                Visualizza Statistiche
              </Button>
            </>
          )}

          {(context === 'qr' || context === 'settings') && (
            <>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Shield className="w-4 h-4" />
                Test Sicurezza
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Zap className="w-4 h-4" />
                Ottimizza Prestazioni
              </Button>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  );
}