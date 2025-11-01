import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        toast.success(t('qr.connected_via_qr', { device: newSession.deviceName }));
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
      toast.success(t('qr.generated'));
    }, 1000);
  };

  const copyQRCode = () => {
    navigator.clipboard.writeText(qrCode);
    toast.success(t('qr.copied_code'));
  };

  const copySessionId = () => {
    navigator.clipboard.writeText(sessionId);
    toast.success(t('qr.copied_session'));
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
            <h2 className="text-xl mb-2">{t('qr.title')}</h2>
            <p className="text-muted-foreground">{t('qr.subtitle')}</p>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-2">
              <Users className="w-3 h-3" />
              {sessions.filter(s => s.status === 'connected').length} {t('qr.connected')}
            </Badge>
            <Button onClick={generateNewQR} disabled={isGenerating} size="sm">
              <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
              {t('qr.renew')}
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* QR Code Section */}
        <GlassCard className="p-6">
          <div className="text-center space-y-4">
            <h3 className="text-lg mb-4">{t('qr.active_code')}</h3>
            
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
                  placeholder={t('qr.session_id_placeholder')}
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
                <span className="font-medium">{t('qr.secure_connection')}</span>
              </div>
              <p className="text-muted-foreground text-xs">
                {t('qr.security_note')}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Instructions and Options */}
        <div className="space-y-4">
          <GlassCard className="p-4">
            <h3 className="mb-3">{t('qr.howto.title')}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                  1
                </div>
                <div>
                  <p className="font-medium">{t('qr.howto.step1.title')}</p>
                  <p className="text-muted-foreground">{t('qr.howto.step1.subtitle')}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                  2
                </div>
                <div>
                  <p className="font-medium">{t('qr.howto.step2.title')}</p>
                  <p className="text-muted-foreground">{t('qr.howto.step2.subtitle')}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                  3
                </div>
                <div>
                  <p className="font-medium">{t('qr.howto.step3.title')}</p>
                  <p className="text-muted-foreground">{t('qr.howto.step3.subtitle')}</p>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="mb-3">{t('qr.advanced.title')}</h3>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Globe className="w-4 h-4" />
                {t('qr.advanced.guest')}
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Lock className="w-4 h-4" />
                {t('qr.advanced.password')}
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Share2 className="w-4 h-4" />
                {t('qr.advanced.share_link')}
              </Button>
            </div>
          </GlassCard>

          {/* Recent Connections */}
          <GlassCard className="p-4">
            <h3 className="mb-3">{t('qr.recent.title')}</h3>
            <div className="space-y-3">
              <AnimatePresence>
                {sessions.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <QrCode className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('qr.recent.empty')}</p>
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
                          {session.status === 'connected' ? t('qr.status.connected') :
                           session.status === 'pending' ? t('qr.status.pending') : t('qr.status.expired')}
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