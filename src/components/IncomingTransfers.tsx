import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Card } from './ui/card';
import { Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { toast } from 'sonner';

interface IncomingTransfer {
  transfer_id: string;
  file_name: string;
  file_size: number;
  sender_ip: string;
  sender_name: string;
  received: number;
  total: number;
  percent: number;
  eta_ms?: number;
  eta_formatted?: string;
}

export function IncomingTransfers() {
  const [incomingTransfers, setIncomingTransfers] = useState<Record<string, IncomingTransfer>>({});
  const { t } = useTranslation();

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    (async () => {
      // Listen for incoming transfer progress
      unlistenProgress = await listen('transfer_progress', (event: { payload: any }) => {
        const p = event.payload as any;
        if (p?.direction === 'receive' && p?.transfer_id) {
          setIncomingTransfers(prev => ({
            ...prev,
            [p.transfer_id]: {
              transfer_id: p.transfer_id,
              file_name: p.file_name || 'Unknown',
              file_size: p.total || 0,
              sender_ip: p.ip || 'Unknown',
              sender_name: p.ip || 'Unknown',
              received: p.received || 0,
              total: p.total || 0,
              percent: Math.min(100, Math.max(0, Math.round(p.percent || 0))),
              eta_ms: p.eta_ms,
              eta_formatted: p.eta_formatted,
            }
          }));
        }
      });

      // Listen for transfer completion
      unlistenComplete = await listen('transfer_complete', (event: { payload: any }) => {
        const p = event.payload as any;
        if (p?.direction === 'receive' && p?.transfer_id) {
          setIncomingTransfers(prev => {
            const newTransfers = { ...prev };
            delete newTransfers[p.transfer_id];
            return newTransfers;
          });
        }
      });
    })();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
    };
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('size_units.bytes')}`;
    const k = 1024;
    const sizes = [t('size_units.bytes'), t('size_units.kb'), t('size_units.mb'), t('size_units.gb')];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCancelTransfer = async (transferId: string, fileName: string) => {
    try {
      await invoke('cancel_transfer_receive', { 
        transfer_id: transferId,
        transferId: transferId
      });
      setIncomingTransfers(prev => {
        const newTransfers = { ...prev };
        delete newTransfers[transferId];
        return newTransfers;
      });
      toast.info(`Ricezione di "${fileName}" annullata`);
    } catch (error) {
      console.error('Errore durante l\'annullamento del trasferimento:', error);
      toast.error(`Errore nell'annullamento del trasferimento`);
    }
  };

  if (Object.keys(incomingTransfers).length === 0) {
    return null;
  }

  return (
    <Card className="backdrop-blur-md bg-white/70 border border-slate-200 shadow-xl p-6 mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 backdrop-blur-sm">
          <Download className="w-5 h-5 text-slate-700" />
        </div>
        <div>
          <h3 className="text-slate-900 font-medium">{t('transfer.incoming_title')}</h3>
          <p className="text-slate-600 text-sm">{t('transfer.incoming_subtitle')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {Object.entries(incomingTransfers).map(([id, transfer]) => (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-4 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-2">
                {/* File name and cancel button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-slate-900 font-medium truncate">{transfer.file_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-700 font-semibold flex-shrink-0">{transfer.percent}%</span>
                    <Button
                      onClick={() => handleCancelTransfer(id, transfer.file_name)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                      title="Annulla trasferimento"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Sender info */}
                <p className="text-slate-600 text-sm">{t('notifications.from')}: {transfer.sender_name}</p>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: `${transfer.percent}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>

                {/* Size and ETA */}
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{formatFileSize(transfer.received)} / {formatFileSize(transfer.file_size)}</span>
                  {transfer.eta_formatted && transfer.percent < 100 && (
                    <span className="font-medium">⏱️ {transfer.eta_formatted}</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  );
}
