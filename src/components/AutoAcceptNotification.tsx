import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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