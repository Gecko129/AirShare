import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Upload, X, File, Send, Users, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// usa il backend Tauri get_file_info invece del plugin-fs
import type { Device } from '../types/device';
import { useTranslation } from "react-i18next";
import { toast } from 'sonner';

interface FileTransferProps {
  selectedDevices: string[];
  onDevicesUpdate?: (callback: (devices: Device[]) => void) => void;
}

interface UploadFile {
  name: string;
  size: number;
  // percorso assoluto richiesto dal backend
  path?: string;
}

export function FileTransfer({ selectedDevices, onDevicesUpdate }: FileTransferProps) {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadETA, setUploadETA] = useState<Record<string, string>>({});

  // Avanzamento per-file per ogni dispositivo: deviceKey -> fileIndex -> stato/percentuale
  const [fileProgress, setFileProgress] = useState<Record<string, Record<number, { percent: number; eta?: string; status: 'queued' | 'uploading' | 'done' | 'error' }>>>({});
  // Indice del file attualmente in upload per device (mutabile senza triggerare re-render a ogni tick)
  const currentFileIndexRef = useRef<Record<string, number>>({});

  // const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  // Stato per la lista di tutti i dispositivi ricevuti dal backend
  const [allDevices, setAllDevices] = useState<Device[]>([]);

  // Ascolta gli eventi di progresso/completamento dal backend (solo invio)
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;
    let unlistenBackendLog: (() => void) | undefined;

    (async () => {
      unlistenProgress = await listen('transfer_progress', (event: { payload: any }) => {
        const p = event.payload as any;
        if (p?.direction === 'send' && p?.ip && p?.port) {
          const deviceKey = `${p.ip}:${p.port}`;
          const percent = typeof p.percent === 'number'
            ? Math.min(100, Math.max(0, Math.round(p.percent)))
            : p.total ? Math.round((p.sent / p.total) * 100) : 0;
          
          setUploadProgress(prev => ({
            ...prev,
            [deviceKey]: percent,
          }));
          
          // Aggiorna ETA se disponibile
          if (p.eta_formatted) {
            setUploadETA(prev => ({
              ...prev,
              [deviceKey]: p.eta_formatted,
            }));
          }

          // Aggiorna anche il progresso per-file corrente di questo device
          const idx = currentFileIndexRef.current[deviceKey];
          if (typeof idx === 'number') {
            setFileProgress(prev => {
              const deviceMap = { ...(prev[deviceKey] || {}) };
              deviceMap[idx] = { percent, eta: p.eta_formatted, status: 'uploading' };
              return { ...prev, [deviceKey]: deviceMap };
            });
          }
        }
      });

      unlistenComplete = await listen('transfer_complete', (event: { payload: any }) => {
        const p = event.payload as any;
        if (p?.direction === 'send' && p?.ip && p?.port) {
          const deviceKey = `${p.ip}:${p.port}`;
          setUploadProgress(prev => ({
            ...prev,
            [deviceKey]: 100,
          }));
          // Rimuovi ETA quando il trasferimento è completato
          setUploadETA(prev => {
            const newETA = { ...prev };
            delete newETA[deviceKey];
            return newETA;
          });

          // Marca il file corrente come completato a 100%
          const idx = currentFileIndexRef.current[deviceKey];
          if (typeof idx === 'number') {
            setFileProgress(prev => {
              const deviceMap = { ...(prev[deviceKey] || {}) };
              const existing = deviceMap[idx] || { percent: 0, status: 'uploading' as const };
              deviceMap[idx] = { ...existing, percent: 100, eta: undefined, status: 'done' };
              return { ...prev, [deviceKey]: deviceMap };
            });
          }
        }
      });

      // Log backend_log events to console and aggiorna progress da stringa
      unlistenBackendLog = await listen('backend_log', (event: { payload: any }) => {
        const p = event.payload as any;
        const level = p?.level ?? 'info';
        const msg = String(p?.message ?? '');
        // eslint-disable-next-line no-console
        console.log(`[backend][${level}]`, msg);

        // Esempi attesi:
        // "send progress | id=... ip=1.2.3.4 port=40123 sent=123 total=456 percent=27.3 eta=1m 20s rimanenti"
        // "send complete | id=... ip=1.2.3.4 port=40123 path=/..."
        // Parse progress con ETA opzionale
        const progressMatchWithETA = msg.match(/^(send|recv) progress \| id=([^ ]+) ip=([^ ]+) port=([^ ]+) (?:sent|received)=([0-9]+) total=([0-9]+) percent=([0-9.]+) eta=(.+)$/);
        const progressMatchWithoutETA = msg.match(/^(send|recv) progress \| id=([^ ]+) ip=([^ ]+) port=([^ ]+) (?:sent|received)=([0-9]+) total=([0-9]+) percent=([0-9.]+)$/);
        
        if (progressMatchWithETA) {
          const direction = progressMatchWithETA[1];
          const ip = progressMatchWithETA[3];
          const port = progressMatchWithETA[4];
          const percentStr = progressMatchWithETA[7];
          const etaStr = progressMatchWithETA[8];
          const percentNum = Number.parseFloat(percentStr);
          if (direction === 'send' && ip && port && Number.isFinite(percentNum)) {
            const deviceKey = `${ip}:${port}`;
            const percent = Math.max(0, Math.min(100, Math.round(percentNum)));
            setUploadProgress(prev => ({ ...prev, [deviceKey]: percent }));
            setUploadETA(prev => ({ ...prev, [deviceKey]: etaStr }));
          }
          return;
        }
        
        if (progressMatchWithoutETA) {
          const direction = progressMatchWithoutETA[1];
          const ip = progressMatchWithoutETA[3];
          const port = progressMatchWithoutETA[4];
          const percentStr = progressMatchWithoutETA[7];
          const percentNum = Number.parseFloat(percentStr);
          if (direction === 'send' && ip && port && Number.isFinite(percentNum)) {
            const deviceKey = `${ip}:${port}`;
            const percent = Math.max(0, Math.min(100, Math.round(percentNum)));
            setUploadProgress(prev => ({ ...prev, [deviceKey]: percent }));
            // Mantieni ETA esistente se disponibile, altrimenti imposta "Calcolo ETA..."
            setUploadETA(prev => {
              if (prev[deviceKey] && prev[deviceKey] !== t("calculating_eta")) {
                return prev;
              }
              return { ...prev, [deviceKey]: t("calculating_eta") };
            });
          }
          return;
        }

        // Parse complete
        const completeMatch = msg.match(/^send complete \| id=([^ ]+) ip=([^ ]+) port=([^ ]+) path=/);
        if (completeMatch) {
          const ip = completeMatch[2];
          const port = completeMatch[3];
          if (ip && port) {
            const deviceKey = `${ip}:${port}`;
            setUploadProgress(prev => ({ ...prev, [deviceKey]: 100 }));
            // Rimuovi ETA quando il trasferimento è completato
            setUploadETA(prev => {
              const newETA = { ...prev };
              delete newETA[deviceKey];
              return newETA;
            });
          }
        }
      });
    })();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenBackendLog) unlistenBackendLog();
    };
  }, []);

  // Aggiorna allDevices quando onDevicesUpdate viene chiamato dal componente padre
  useEffect(() => {
    if (!onDevicesUpdate) return;
    // Qui aggiorniamo i device tramite callback fornita dal padre
    const updateNames = (devices: Device[]) => {
      setAllDevices(devices); // Salva anche tutti i device per lookup completo
    };
    // Fornisci la funzione updateNames come callback al parent
    onDevicesUpdate(updateNames);
  }, [onDevicesUpdate]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const dropped: UploadFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i] as any;
      dropped.push({
        name: f.name,
        size: (typeof f.size === 'number' ? f.size : 0),
        // In molti ambienti web il path non è disponibile; Tauri/Electron a volte lo forniscono come f.path
        path: typeof f.path === 'string' ? f.path : undefined,
      });
    }
    setSelectedFiles(prev => [...prev, ...dropped]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileDialog = async () => {
    console.log("Apertura finestra di dialogo file");
    const selected = await open({ multiple: true });
    if (!selected) return;

    const addOne = async (path: string) => {
      try {
        const fileInfo = await invoke<{ size: number; name: string; is_file: boolean }>('get_file_info', { filePath: path });
        const item: UploadFile = {
          name: fileInfo?.name || (path.split(/[\\/]/).pop() || 'file'),
          size: typeof fileInfo?.size === 'number' ? fileInfo.size : 0,
          path,
        };
        setSelectedFiles(prev => [...prev, item]);
      } catch (error) {
        console.error("Errore nel leggere le informazioni del file:", error);
        const item: UploadFile = {
          name: path.split(/[\\/]/).pop() || 'file',
          size: 0,
          path,
        };
        setSelectedFiles(prev => [...prev, item]);
      }
    };

    if (typeof selected === 'string') {
      await addOne(selected);
    } else if (Array.isArray(selected)) {
      for (const p of selected) {
        await addOne(p);
      }
    }
  };

  const handleSend = async () => {
    if (selectedFiles.length === 0 || selectedDevices.length === 0) return;

    console.log("🚀 [FileTransfer] Inizio invio:", { 
      files: selectedFiles.map(f => ({ name: f.name, size: f.size, path: f.path })),
      devices: selectedDevices 
    });

    setIsUploading(true);
    setUploadProgress({});
    setUploadETA({});
    setFileProgress({});
    currentFileIndexRef.current = {};
    toast.info(t("transfer_start", { fileCount: selectedFiles.length, deviceCount: selectedDevices.length }));

    const sendToDevice = async (deviceId: string) => {
      let targetIp = '';
      let targetPort = 0;
      if (deviceId.includes(':')) {
        const [ip, port] = deviceId.split(':');
        targetIp = ip;
        targetPort = parseInt(port, 10);
      } else {
        targetIp = deviceId;
        targetPort = 40123;
      }

      const deviceKey = `${targetIp}:${targetPort}`;
      setUploadProgress(prev => ({ ...prev, [deviceKey]: 0 }));
              setUploadETA(prev => ({ ...prev, [deviceKey]: t("calculating_eta") }));
      // Inizializza progressi per-file (tutti in coda)
      setFileProgress(prev => ({
        ...prev,
        [deviceKey]: Object.fromEntries(selectedFiles.map((_, i) => [i, { percent: 0, status: 'queued' as const }]))
      }));

      try {
        for (let i = 0; i < selectedFiles.length; i++) {
          const f = selectedFiles[i];
          const filePath = f.path || f.name;
          if (!f.path) {
            console.warn('⚠️ [FileTransfer] Path mancante per', f.name, '- prova a selezionare tramite pulsante Seleziona file');
          }
          
          console.log(`📤 [FileTransfer] Invio file ${i+1}/${selectedFiles.length}:`, {
            name: f.name,
            size: f.size,
            path: filePath,
            target: `${targetIp}:${targetPort}`
          });
          
          // marca come in upload il file i
          currentFileIndexRef.current[deviceKey] = i;
          setFileProgress(prev => {
            const deviceMap = { ...(prev[deviceKey] || {}) };
            deviceMap[i] = { percent: 0, status: 'uploading' };
            return { ...prev, [deviceKey]: deviceMap };
          });

          await invoke('send_file', { ip: targetIp, port: targetPort, filePath });
          // al ritorno, è già marcato done dal listener; se non arrivasse l'evento, forza done
          setFileProgress(prev => {
            const deviceMap = { ...(prev[deviceKey] || {}) };
            const existing = deviceMap[i] || { percent: 0, status: 'uploading' as const };
            deviceMap[i] = { ...existing, percent: 100, eta: undefined, status: 'done' };
            return { ...prev, [deviceKey]: deviceMap };
          });
        }
        toast.success(t("transfer_success", { device: deviceKey }));
      } catch (err) {
        console.error('❌ [FileTransfer] Errore durante invio verso', deviceKey, err);
        console.error('❌ [FileTransfer] Stack trace:', err);
        toast.error(t("transfer_error", { device: deviceKey }));
        
        // marca corrente come errore
        const idx = currentFileIndexRef.current[deviceKey];
        if (typeof idx === 'number') {
          setFileProgress(prev => {
            const deviceMap = { ...(prev[deviceKey] || {}) };
            const existing = deviceMap[idx] || { percent: 0, status: 'uploading' as const };
            deviceMap[idx] = { ...existing, status: 'error' };
            return { ...prev, [deviceKey]: deviceMap };
          });
        }
        
        // Log dettagliato dell'errore per debug
        if (err instanceof Error) {
          console.error('❌ [FileTransfer] Error details:', {
            message: err.message,
            name: err.name,
            stack: err.stack
          });
        }
      } finally {
        setUploadETA(prev => {
          const n = { ...prev };
          delete n[deviceKey];
          return n;
        });
      }
    };

    await Promise.all(selectedDevices.map(d => sendToDevice(d)));

    setIsUploading(false);
    setSelectedFiles([]);
    setUploadProgress({});
    setUploadETA({});
  };

  const removeFile = (index?: number) => {
    if (typeof index === 'number') {
      setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setSelectedFiles([]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const canSend = selectedFiles.length > 0 && selectedDevices.length > 0 && !isUploading;

  return (
    <Card className="backdrop-blur-md bg-gray-900/40 border border-gray-700/50 shadow-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-full bg-gradient-to-r from-gray-700/40 to-slate-600/40 backdrop-blur-sm">
          <Upload className="w-6 h-6 text-gray-200" />
        </div>
        <div>
          <h2 className="text-gray-100">{t("file_transfer_title")}</h2>
          <p className="text-gray-400 text-sm">{t("file_transfer_description")}</p>
        </div>
      </div>

      {/* Dispositivi di destinazione */}
      {selectedDevices.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-slate-800/30 border border-slate-700/40">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-slate-300" />
            <span className="text-slate-200 text-sm">
              {t("sending_to_devices", { count: selectedDevices.length })}
            </span>
          </div>
          <div className="space-y-2">
            {selectedDevices.map(deviceId => {
              const device = allDevices.find(d => d.id === deviceId) ?? { name: "Dispositivo", ip: deviceId };
              const deviceTyped = device as Device & { ip: string; port?: number };
              const key = `${deviceTyped.ip}:${deviceTyped.port ?? 40123}`;
              const name = deviceTyped.name ?? "Dispositivo";
              const ip = deviceTyped.ip;

              return (
                <div key={deviceId} className="text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">{`${name} (${ip})`}</span>
                    {isUploading && uploadProgress[key] !== undefined && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1 bg-gray-700/60 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-slate-400 transition-all duration-300"
                              style={{ width: `${uploadProgress[key]}%` }}
                            />
                          </div>
                          <span className="text-gray-400 text-xs w-8">{uploadProgress[key]}%</span>
                        </div>
                        {uploadETA[key] && uploadETA[key] !== t("calculating_eta") && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/40 border border-slate-600/40">
                            <span className="text-slate-300 text-xs">⏱️</span>
                            <span className="text-slate-200 text-xs">{uploadETA[key]}</span>
                          </div>
                        )}
                        {uploadETA[key] === t("calculating_eta") && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-600/40 border border-slate-500/40">
                            <span className="text-slate-400 text-xs">⏳</span>
                            <span className="text-slate-300 text-xs">{t("calculating_eta")}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progress per-file */}
                  {isUploading && fileProgress[key] && (
                    <div className="space-y-1 pl-2">
                      {selectedFiles.map((f, idx) => {
                        const fp = fileProgress[key]?.[idx];
                        const pct = Math.max(0, Math.min(100, Math.round(fp?.percent ?? (fp?.status === 'done' ? 100 : 0))));
                        const status = fp?.status ?? 'queued';
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <span className="text-gray-400 text-xs w-44 truncate">{f.name}</span>
                            <div className="flex-1 h-1 bg-gray-700/60 rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-300 ${status === 'error' ? 'bg-red-400' : 'bg-slate-400'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-gray-400 text-xs w-10 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* File drop area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleFileDialog}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-slate-500/60 bg-slate-700/20'
            : 'border-gray-600/50 hover:border-gray-500/70 hover:bg-gray-800/20'
        }`}
      >
        <AnimatePresence mode="wait">
          {selectedFiles.length === 0 ? (
            <motion.div
              key="upload-area"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="p-4 rounded-full bg-gray-800/40 w-fit mx-auto">
                <Upload className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="text-gray-200">{t("drop_file_text")}</p>
                <p className="text-gray-500 text-sm mt-1">{t("drop_file_subtext")}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="file-list"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="space-y-3"
            >
              <div className="space-y-2">
                {selectedFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/40">
                    <div className="flex items-center gap-3">
                      <File className="w-6 h-6 text-slate-300" />
                      <div className="text-left">
                        <p className="text-gray-200 truncate max-w-xs">{f.name}</p>
                        <p className="text-gray-400 text-sm">{formatFileSize(f.size)}</p>
                      </div>
                    </div>
                    <Button
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-gray-200 hover:bg-gray-700/60"
                      type="button"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); removeFile(); }}
                    variant="ghost"
                    size="sm"
                    className="text-gray-300 hover:text-gray-100 hover:bg-gray-700/60"
                    type="button"
                  >
                    Rimuovi tutti
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Warning per nessun dispositivo selezionato */}
      {selectedFiles.length > 0 && selectedDevices.length === 0 && (
        <div className="mt-4 p-3 rounded-lg bg-orange-900/40 border border-orange-700/40 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-400" />
          <span className="text-orange-300 text-sm">{t("no_device_selected")}</span>
        </div>
      )}

      {/* Send button */}
      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSend}
          disabled={!canSend}
          className="bg-gradient-to-r from-slate-600 to-gray-700 hover:from-slate-500 hover:to-gray-600 text-gray-100 border-0 shadow-lg backdrop-blur-sm disabled:opacity-50"
          type="button"
        >
          <AnimatePresence mode="wait">
            {isUploading ? (
              <motion.div
                key="uploading"
                initial={{ opacity: 0, rotate: -180 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 180 }}
                className="flex items-center gap-2"
              >
                <div className="w-4 h-4 border-2 border-gray-400/40 border-t-gray-200 rounded-full animate-spin" />
                {t("uploading")}
              </motion.div>
            ) : (
              <motion.div
                key="send"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {t("send_button_text", { count: selectedDevices.length })}
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </Card>
  );
}