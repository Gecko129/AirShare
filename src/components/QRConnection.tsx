import { useState, useEffect } from 'react';
import { GlassCard } from './GlassCard';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { 
  QrCode, 
  Smartphone, 
  Wifi, 
  Copy, 
  RefreshCw, 
  CheckCircle, 
  Timer,
  Share2,
  Shield,
  Users,
  Globe,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface ConnectionSession {
  id: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop';
  status: 'pending' | 'connected' | 'expired';
  connectedAt?: Date;
  expiresAt: Date;
}

export function QRConnection() {
  const [qrCode, setQrCode] = useState('AirShare://connect?session=abc123&key=xyz789');
  const [sessionId, setSessionId] = useState('AS-' + Math.random().toString(36).substr(2, 8).toUpperCase());
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes
  const [sessions, setSessions] = useState<ConnectionSession[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          generateNewQR();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Mock session updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.1) { // 10% chance each second
        const newSession: ConnectionSession = {
          id: Math.random().toString(36).substr(2, 9),
          deviceName: ['iPhone 15 Pro', 'Samsung Galaxy S24', 'iPad Air', 'Google Pixel 8'][Math.floor(Math.random() * 4)],
          deviceType: Math.random() < 0.7 ? 'mobile' : 'desktop',
          status: 'connected',
          connectedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        };
        
        setSessions(prev => [newSession, ...prev.slice(0, 4)]);
        toast.success(`${newSession.deviceName} connesso tramite QR!`);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const generateNewQR = async () => {
    setIsGenerating(true);
    
    // Simulate QR generation
    setTimeout(() => {
      const newSessionId = 'AS-' + Math.random().toString(36).substr(2, 8).toUpperCase();
      setSessionId(newSessionId);
      setQrCode(`AirShare://connect?session=${newSessionId}&key=${Math.random().toString(36).substr(2, 16)}`);
      setTimeRemaining(300);
      setIsGenerating(false);
      toast.success('Nuovo QR Code generato!');
    }, 1000);
  };

  const copyQRCode = () => {
    navigator.clipboard.writeText(qrCode);
    toast.success('Codice QR copiato negli appunti!');
  };

  const copySessionId = () => {
    navigator.clipboard.writeText(sessionId);
    toast.success('ID sessione copiato negli appunti!');
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getTimerColor = () => {
    if (timeRemaining <= 60) return 'text-red-500';
    if (timeRemaining <= 120) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl mb-2">Connessione QR Code</h2>
            <p className="text-muted-foreground">
              Connetti rapidamente nuovi dispositivi scannerizzando il QR Code
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-2">
              <Users className="w-3 h-3" />
              {sessions.filter(s => s.status === 'connected').length} Connessi
            </Badge>
            <Button onClick={generateNewQR} disabled={isGenerating} size="sm">
              <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
              Rinnova QR
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* QR Code Section */}
        <GlassCard className="p-6">
          <div className="text-center space-y-4">
            <h3 className="text-lg mb-4">Codice QR Attivo</h3>
            
            {/* QR Code Display */}
            <motion.div
              key={sessionId}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="mx-auto w-48 h-48 bg-white rounded-lg flex items-center justify-center border-4 border-border"
            >
              <div className="text-center">
                <QrCode className="w-32 h-32 mx-auto text-black" />
                <p className="text-xs text-black mt-2 font-mono">{sessionId}</p>
              </div>
            </motion.div>

            {/* Timer */}
            <motion.div
              animate={{ scale: timeRemaining <= 60 ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 0.5, repeat: timeRemaining <= 60 ? Infinity : 0 }}
              className="flex items-center justify-center gap-2"
            >
              <Timer className={`w-4 h-4 ${getTimerColor()}`} />
              <span className={`font-mono ${getTimerColor()}`}>
                {formatTime(timeRemaining)}
              </span>
            </motion.div>

            {/* Connection URL */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={qrCode}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button onClick={copyQRCode} size="sm" variant="outline">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <Input
                  value={sessionId}
                  readOnly
                  placeholder="ID Sessione"
                  className="font-mono"
                />
                <Button onClick={copySessionId} size="sm" variant="outline">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Security Info */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span className="font-medium">Connessione Sicura</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Ogni QR Code ha una durata limitata e include chiavi di crittografia uniche
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Instructions and Options */}
        <div className="space-y-4">
          <GlassCard className="p-4">
            <h3 className="mb-3">Come Connettere</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                  1
                </div>
                <div>
                  <p className="font-medium">Apri AirShare sul dispositivo</p>
                  <p className="text-muted-foreground">Installa l'app se non presente</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                  2
                </div>
                <div>
                  <p className="font-medium">Scansiona il QR Code</p>
                  <p className="text-muted-foreground">Usa la fotocamera o scanner integrato</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                  3
                </div>
                <div>
                  <p className="font-medium">Connessione automatica</p>
                  <p className="text-muted-foreground">Il dispositivo apparirà nella lista</p>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="mb-3">Opzioni Avanzate</h3>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Globe className="w-4 h-4" />
                Connessione Guest (24h)
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Lock className="w-4 h-4" />
                Connessione Protetta da Password
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Share2 className="w-4 h-4" />
                Condividi Link di Invito
              </Button>
            </div>
          </GlassCard>

          {/* Recent Connections */}
          <GlassCard className="p-4">
            <h3 className="mb-3">Connessioni Recenti</h3>
            <div className="space-y-3">
              <AnimatePresence>
                {sessions.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <QrCode className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nessuna connessione ancora</p>
                  </div>
                ) : (
                  sessions.map((session, index) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50"
                    >
                      <div className="p-2 bg-accent rounded border">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{session.deviceName}</p>
                        <p className="text-sm text-muted-foreground">
                          {session.connectedAt ? 
                            `Connesso ${session.connectedAt.toLocaleTimeString()}` : 
                            'In attesa...'
                          }
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          session.status === 'connected' ? 'text-green-600 border-green-200' :
                          session.status === 'pending' ? 'text-yellow-600 border-yellow-200' :
                          'text-red-600 border-red-200'
                        }>
                          {session.status === 'connected' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {session.status === 'connected' ? 'Connesso' :
                           session.status === 'pending' ? 'Attesa' : 'Scaduto'}
                        </Badge>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}