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

  const handleRemoveDevice = async (ip: string) => {
    try {
      await invoke('remove_trusted_device_ip', { ip });
      setTrustedDevices(prev => prev.filter(device => device !== ip));
      setDeviceToRemove(null);
    } catch (error) {
      console.error('Errore nella rimozione del dispositivo:', error);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t('settings.trusted_devices_title', 'Dispositivi Fidati')}
          </DialogTitle>
          <DialogDescription>
            {t('settings.trusted_devices_desc', 'Gestisci i dispositivi che possono inviare file senza conferma')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('settings.loading', 'Caricamento...')}
            </div>
          ) : trustedDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t('settings.no_trusted_devices', 'Nessun dispositivo fidato')}</p>
              <p className="text-sm mt-1">
                {t('settings.no_trusted_devices_hint', 'Accetta un trasferimento e seleziona "Ricorda dispositivo"')}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {trustedDevices.map((device) => (
                <div
                  key={device}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{device}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.trusted_device_ip', 'Indirizzo IP')}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeviceToRemove(device)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            {t('settings.close', 'Chiudi')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Conferma rimozione */}
    <AlertDialog open={!!deviceToRemove} onOpenChange={() => setDeviceToRemove(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            {t('settings.remove_device_title', 'Rimuovi dispositivo fidato')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.remove_device_desc', 'Sei sicuro di voler rimuovere questo dispositivo dalla lista dei fidati?')}
            <br />
            <span className="font-mono text-sm mt-2 block">{deviceToRemove}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeviceToRemove(null)}>
            {t('settings.cancel', 'Annulla')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deviceToRemove && handleRemoveDevice(deviceToRemove)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('settings.remove', 'Rimuovi')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}