import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Trash2, Shield, X, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { useTranslation } from 'react-i18next';

interface TrustedDevicesManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrustedDevicesManager({ open, onOpenChange }: TrustedDevicesManagerProps) {
  const [trustedDevices, setTrustedDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceToRemove, setDeviceToRemove] = useState<string | null>(null);
  const { t } = useTranslation();

  const loadTrustedDevices = async () => {
    setLoading(true);
    try {
      const devices = await invoke<string[]>('list_trusted_devices');
      setTrustedDevices(devices || []);
    } catch (error) {
      console.error('Errore nel caricamento dispositivi fidati:', error);
      setTrustedDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadTrustedDevices();
    }
  }, [open]);

  const handleRemoveDevice = async (mac: string) => {
    try {
      await invoke('remove_trusted_device_mac', { mac });
      setTrustedDevices(prev => prev.filter(device => device !== mac));
      setDeviceToRemove(null);
    } catch (error) {
      console.error('Errore nella rimozione del dispositivo:', error);
    }
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: "#fefefe",
          color: "#1e1e1e",
          boxShadow: "0 2px 16px rgba(0,0,0,0.1)",
          border: "1px solid #ddd",
        }}
        className="sm:max-w-md"
      >
        <DialogHeader
          style={{ background: "transparent" }}
        >
          <DialogTitle
            style={{
              color: "#111",
              background: "transparent",
              fontWeight: 600,
              fontFamily: "inherit",
            }}
            className="flex items-center gap-2"
          >
            <Shield className="w-5 h-5 text-gray-900" />
            {t("settings.trusted_devices_title")}
          </DialogTitle>
          <DialogDescription
            style={{
              color: "#555",
              background: "transparent",
            }}
            className="text-sm"
          >
            {t("settings.trusted_devices_desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="text-center py-8" style={{ color: "#777" }}>
              {t("settings.loading")}
            </div>
          ) : trustedDevices.length === 0 ? (
            <div className="text-center py-8" style={{ color: "#777" }}>
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-50 text-gray-500" />
              <p style={{ color: "#1e1e1e" }}>{t("settings.no_trusted_devices")}</p>
              <p className="text-sm mt-1" style={{ color: "#666" }}>
                {t("settings.no_trusted_devices_hint")}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {trustedDevices.map((device) => (
                <div
                  key={device}
                  className="flex items-center justify-between p-3 rounded-lg border transition-colors"
                  style={{
                    backgroundColor: "#fafafa",
                    borderColor: "#ddd",
                    cursor: "default",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = "#e6f0ff";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = "#fafafa";
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      style={{ backgroundColor: "#dbeafe" }}
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                    >
                      <Shield className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p style={{ color: "#1e1e1e", fontWeight: 500 }}>{device}</p>
                      <p className="text-xs" style={{ color: "#666" }}>
                        {t("mac_label")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeviceToRemove(device)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            style={{
              background: "#fff",
              color: "#1e1e1e",
              borderColor: "#ddd",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f0f0f0")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff")
            }
          >
            <X className="w-4 h-4 mr-2" />
            {t("settings.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Conferma rimozione */}
    <AlertDialog open={!!deviceToRemove} onOpenChange={() => setDeviceToRemove(null)}>
      <AlertDialogContent
        style={{
          background: "#fefefe",
          color: "#1e1e1e",
          boxShadow: "0 2px 16px rgba(0,0,0,0.1)",
          border: "1px solid #ddd",
        }}
      >
        <AlertDialogHeader
          style={{ background: "transparent" }}
        >
          <AlertDialogTitle
            style={{ color: "#b91c1c", background: "transparent" }}
            className="flex items-center gap-2"
          >
            <AlertCircle className="w-5 h-5" />
            {t("settings.remove_device_title")}
          </AlertDialogTitle>
          <AlertDialogDescription
            style={{ color: "#555", background: "transparent" }}
          >
            {t("settings.remove_device_desc")}
            <br />
            <span className="font-mono text-sm mt-2 block" style={{ color: "#333" }}>
              {deviceToRemove}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => setDeviceToRemove(null)}
            style={{
              background: "#fff",
              color: "#1e1e1e",
              border: "1px solid #ddd",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f0f0")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
          >
            {t("settings.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deviceToRemove && handleRemoveDevice(deviceToRemove)}
            style={{
              background: "#b91c1c",
              color: "#fff",
              border: "1px solid #7f1d1d",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#991b1b")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b91c1c")}
          >
            {t("settings.remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);



}