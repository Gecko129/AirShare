import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle, Download, Upload, X } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "sent" | "received";
  file_name: string;
  from_device: string;
  to_device: string;
  timestamp: string;
}

export function TransferNotification() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unlistenPromise = listen<Omit<Notification, "id">>(
      "transfer_notification",
      (event) => {
        const notification: Notification = {
          id: `${event.payload.file_name}-${Date.now()}`,
          ...event.payload,
        };

        setNotifications((prev) => [...prev, notification]);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          setNotifications((prev) =>
            prev.filter((n) => n.id !== notification.id)
          );
        }, 5000);
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="fixed top-20 right-4 z-50 space-y-3 max-w-sm pointer-events-none">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: -20, x: 400 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20, x: 400 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="pointer-events-auto"
          >
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg shadow-lg overflow-hidden backdrop-blur-sm">
              {/* Progress bar */}
              <motion.div
                className="absolute top-0 left-0 h-1 bg-gradient-to-r from-green-400 to-emerald-400"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 5, ease: "linear" }}
              />

              <div className="p-4">
                {/* Header with icon and title */}
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 mt-0.5">
                    {notification.type === "sent" ? (
                      <Upload className="w-5 h-5 text-green-600" />
                    ) : (
                      <Download className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-green-900">
                      {notification.title}
                    </p>
                    <p className="text-sm text-green-700 mt-1 break-words">
                      {notification.message}
                    </p>
                  </div>
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="flex-shrink-0 text-green-500 hover:text-green-700 transition-colors"
                    aria-label="Close notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Device info */}
                <div className="ml-8 text-xs text-green-600 space-y-1">
                  <p>
                    📱 {notification.from_device} →{" "}
                    {notification.to_device}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
