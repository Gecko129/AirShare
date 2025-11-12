import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Shield, X, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AutoAcceptEvent {
  transfer_id: string;
  file_name: string;
  file_size: number;
  ip: string;
  device_name: string;
}

interface Notification {
  id: string;
  event: AutoAcceptEvent;
  timestamp: number;
}

export function AutoAcceptNotification() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    const unlistenPromise = listen<AutoAcceptEvent>("transfer_auto_accepted", (event) => {
      console.log("🔔 Auto-accept notification:", event.payload);
      
      const notification: Notification = {
        id: event.payload.transfer_id,
        event: event.payload,
        timestamp: Date.now(),
      };
      
      setNotifications(prev => [...prev, notification]);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return `0 ${t('size_units.kb')}`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} ${t('size_units.kb')}`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} ${t('size_units.mb')}`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} ${t('size_units.gb')}`;
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="bg-gradient-to-br from-emerald-500/90 to-emerald-600/90 backdrop-blur-sm text-white rounded-lg shadow-lg p-4 animate-in slide-in-from-top-5 duration-300"
          style={{
            boxShadow: "0 4px 20px rgba(16, 185, 129, 0.4)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-semibold text-sm">
                  {t('notifications.auto_accepted_title', 'Trasferimento Auto-Accettato')}
                </p>
                <button
                  onClick={() => removeNotification(notification.id)}
                  className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-white/90">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate font-medium">
                    {notification.event.file_name}
                  </span>
                </div>
                
                <div className="text-xs text-white/80 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span>{t('notifications.from')}:</span>
                    <span className="font-mono">{notification.event.device_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t('notifications.size')}:</span>
                    <span>{formatFileSize(notification.event.file_size)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/60 rounded-full animate-progress"
              style={{
                animation: "progress 5s linear forwards"
              }}
            />
          </div>
        </div>
      ))}
      
      <style>{`
        @keyframes progress {
          from { width: 100%; }
          to { width: 0%; }
        }
        
        @keyframes slide-in-from-top-5 {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .animate-in {
          animation: slide-in-from-top-5 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}