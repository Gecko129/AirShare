import { useState, useEffect } from 'react';
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

  // Progresso generale per dispositivo (semplificato)
  const [generalProgress, setGeneralProgress] = useState<Record<string, { percent: number; eta?: string; currentFile?: string; totalFiles: number; completedFiles: number }>>({});

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

          // Il progresso generale viene gestito dai log del backend
        }
      });

      // Log backend_log events to console and aggiorna progress da stringa
      unlistenBackendLog = await listen('backend_log', (event: { payload: any }) => {
        const p = event.payload as any;
        const level = p?.level ?? 'info';
        const msg = String(p?.message ?? '');
        // eslint-disable-next-line no-console
        console.log(`[backend][${level}]`, msg);

                 // Robust regex for progress parsing (with named groups), handles percent and eta, skips truncated lines.
         // Truncated lines (with …) are ignored.
         if (msg.includes("…")) return;

         // New format: send progress | id=XYZ ip=1.2.3.4 port=40123 overall_sent=123 overall_total=456 overall_percent=78.9 overall_eta=23s rimanenti batch_id=ABC123
         const overallProgressRegex = /^(?<direction>send|recv) progress \| id=(?<id>[^ ]+) ip=(?<ip>[^ ]+) port=(?<port>[^ ]+) overall_sent=(?<overall_sent>\d+) overall_total=(?<overall_total>\d+) overall_percent=(?<overall_percent>[\d.]+) overall_eta=(?<overall_eta>.+?)(?: batch_id=(?<batch_id>[^ ]+))?$/;
         const overallMatch = msg.match(overallProgressRegex);
         
         // Debug: log delle regex matches per il nuovo formato
         if (msg.includes('overall_sent')) {
           console.log('🔍 [DEBUG] Parsing overall progress log:', msg);
           console.log('🔍 [DEBUG] Overall match:', overallMatch);
         }
         
         // Fallback to old format for backward compatibility
         const progressRegex = /^(?<direction>send|recv) progress \| id=(?<id>[^ ]+) ip=(?<ip>[^ ]+) port=(?<port>[^ ]+) (?:sent|received)=(?<sent>\d+) total=(?<total>\d+) percent=(?<percent>[\d.]+)(?: eta=(?<eta>.+?))? file=(?<file>.+?)(?: \((?<index>\d+)\/(?<count>\d+)\))?$/;
         const match = msg.match(progressRegex);

        // Handle new overall progress format
        if (overallMatch && overallMatch.length >= 9) {
          const direction = overallMatch[1];
          const ip = overallMatch[3];
          const port = overallMatch[4];
          const overall_sent = overallMatch[5];
          const overall_total = overallMatch[6];
          const overall_percent = overallMatch[7];
          const overall_eta = overallMatch[8];
          const batch_id = overallMatch[9]; // Può essere undefined se non presente
          
          console.log('🔍 [DEBUG] Parsed values:', { direction, ip, port, overall_percent, overall_eta, batch_id });
          
          // Log del batch_id se presente
          if (batch_id) {
            console.log(`🔗 [DEBUG] Batch ID ricevuto dal backend: ${batch_id}`);
          } else {
            console.log('⚠️ [DEBUG] Nessun batch_id ricevuto dal backend nel log di progresso');
          }
          
          if (direction === 'send' && ip && port && overall_percent) {
            const deviceKey = `${ip}:${port}`;
            const percentNum = Number(overall_percent);
            const percentClamped = Math.max(0, Math.min(100, Math.round(percentNum)));
            
            console.log('🔍 [DEBUG] Updating progress:', { deviceKey, percentClamped, overall_eta });
            
            // Update general progress with overall information
            setGeneralProgress(prev => {
              const current = prev[deviceKey] || { percent: 0, totalFiles: selectedFiles.length, completedFiles: 0 };
              return {
                ...prev,
                [deviceKey]: {
                  ...current,
                  percent: percentClamped,
                  eta: overall_eta,
                  totalFiles: selectedFiles.length,
                  completedFiles: Math.round((percentClamped / 100) * selectedFiles.length),
                }
              };
            });
            
            setUploadProgress(prev => ({ ...prev, [deviceKey]: percentClamped }));
            setUploadETA(prev => ({ ...prev, [deviceKey]: overall_eta }));
          }
          return;
        }
        
        // Fallback to old format for backward compatibility
        if (match && match.groups) {
          const {
            direction,
            ip,
            port,
            percent,
            eta,
            file,
            index,
            count,
          } = match.groups;
          // Only handle 'send'
          if (direction === 'send' && ip && port && percent) {
            const deviceKey = `${ip}:${port}`;
            const percentNum = Number(percent);
            const percentClamped = Math.max(0, Math.min(100, Math.round(percentNum)));
            const totalFiles = count ? parseInt(count, 10) : selectedFiles.length;
            const completedFiles = index ? parseInt(index, 10) - 1 : 0;
            // Update general progress
            setGeneralProgress(prev => {
              const current = prev[deviceKey] || { percent: 0, totalFiles, completedFiles: 0 };
              return {
                ...prev,
                [deviceKey]: {
                  ...current,
                  percent: percentClamped,
                  eta: eta ?? current.eta ?? t("calculating_eta"),
                  currentFile: file,
                  totalFiles,
                  completedFiles,
                }
              };
            });
            setUploadProgress(prev => ({ ...prev, [deviceKey]: percentClamped }));
            // Update ETA if present, otherwise keep old or set calculating
            setUploadETA(prev => {
              if (eta) {
                return { ...prev, [deviceKey]: eta };
              }
              // If no eta, keep previous or set to calculating
              if (prev[deviceKey] && prev[deviceKey] !== t("calculating_eta")) {
                return prev;
              }
              return { ...prev, [deviceKey]: t("calculating_eta") };
            });
          }
          return;
        }

        // Parse complete
        const completeMatch = msg.match(/^send complete \| id=([^ ]+) ip=([^ ]+) port=([^ ]+) path=([^ ]+) file=([^ ]+)(?: \((\d+)\/(\d+)\))?$/);
        if (completeMatch) {
          const ip = completeMatch[2];
          const port = completeMatch[3];
          const currentFileIndex = completeMatch[6] ? parseInt(completeMatch[6], 10) - 1 : 0;
          const totalFiles = completeMatch[7] ? parseInt(completeMatch[7], 10) : selectedFiles.length;
          
          if (ip && port) {
            const deviceKey = `${ip}:${port}`;
            
            // Aggiorna progresso generale - file completato
            setGeneralProgress(prev => {
              const current = prev[deviceKey] || { percent: 0, totalFiles, completedFiles: 0 };
              const newCompletedFiles = currentFileIndex + 1;
              const overallPercent = Math.round((newCompletedFiles / totalFiles) * 100);
              
              return {
                ...prev,
                [deviceKey]: {
                  ...current,
                  percent: overallPercent,
                  completedFiles: newCompletedFiles,
                  totalFiles,
                  currentFile: newCompletedFiles >= totalFiles ? undefined : selectedFiles[newCompletedFiles]?.name,
                  eta: newCompletedFiles >= totalFiles ? undefined : current.eta
                }
              };
            });
            
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
//ciao
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

  // Utility per generare un batchId univoco
  function generateBatchId() {
    // Usa crypto.randomUUID se disponibile, altrimenti fallback su timestamp e random
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID();
    }
    return `batch_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }

  const handleSend = async () => {
    if (selectedFiles.length === 0 || selectedDevices.length === 0) return;

    // Genera un batchId univoco per questo invio
    const batchId = generateBatchId();
    
    // Validazione del batchId
    if (!batchId || batchId.trim() === '') {
      console.error('❌ [FileTransfer] Errore: batchId generato è vuoto o null');
      toast.error('Errore nella generazione del batch ID');
      return;
    }
    
    // Log che distingue chiaramente il batchId come identificatore globale del trasferimento
    console.log("📦 [FileTransfer] Global batchId for whole transfer:", batchId);
    console.log("🚀 [FileTransfer] Inizio invio:", { 
      files: selectedFiles.map(f => ({ name: f.name, size: f.size, path: f.path })),
      devices: selectedDevices,
      batchId
    });

    setIsUploading(true);
    setUploadProgress({});
    setUploadETA({});
    setGeneralProgress({});
    toast.info(t("transfer_start", { fileCount: selectedFiles.length, deviceCount: selectedDevices.length }));

    const sendToDevice = async (deviceRef: any) => {
      // Trova device in allDevices per ottenere IP e porta corretti
      let targetIp = '';
      let targetPort = 0;
      // Normalizza l'identificatore in stringa se necessario
      const deviceId = typeof deviceRef === 'string' ? deviceRef : (deviceRef?.id ?? deviceRef?.ip ?? String(deviceRef ?? ''));
      // Prova a trovare il device in allDevices per port
      const foundDevice = allDevices.find(d => d.id === deviceId);
      if (foundDevice) {
        const device = foundDevice as Device;
        targetIp = device.ip;
        targetPort = typeof device.port === 'number' ? device.port : 40124;
      } else if (typeof deviceId === 'string' && deviceId.includes(':')) {
        const [ip, port] = deviceId.split(':');
        targetIp = ip;
        targetPort = Number.isNaN(Number(port)) ? 40124 : parseInt(port, 10);
      } else {
        targetIp = String(deviceId);
        targetPort = 40124;
      }

      // Usa la stessa chiave per progress e trasferimento: deviceKey = `${ip}:${port}`
      const deviceKey = `${targetIp}:${targetPort}`;

      setUploadProgress(prev => ({ ...prev, [deviceKey]: 0 }));
      setUploadETA(prev => ({ ...prev, [deviceKey]: t("calculating_eta") }));
      // Inizializza progresso generale
      setGeneralProgress(prev => ({
        ...prev,
        [deviceKey]: {
          percent: 0,
          totalFiles: selectedFiles.length,
          completedFiles: 0,
          eta: t("calculating_eta")
        }
      }));

      try {
        // Calcola la dimensione totale di tutti i file UNA SOLA VOLTA per batch
        const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
        for (let i = 0; i < selectedFiles.length; i++) {
          const f = selectedFiles[i];
          const filePath = f.path || f.name;
          if (!f.path) {
            console.warn('⚠️ [FileTransfer] Path mancante per', f.name, '- prova a selezionare tramite pulsante Seleziona file');
          }

          // Log con batchId, deviceKey, fileIndex, fileName
          console.log(
            `[FileTransfer] Invio file (batchId=${batchId}, deviceKey=${deviceKey}, fileIndex=${i}, fileName=${f.name})`
          );
          // Log esplicito che mostra il batchId inviato al backend con il file
          console.log(
            `➡️ [FileTransfer] Sending batchId to backend with file:`, { batchId, deviceKey, fileName: f.name }
          );
          // Log aggiuntivo per debug del batch_id
          console.log(
            `🔗 [FileTransfer] Batch ID globale per questo trasferimento: ${batchId} (file ${i + 1}/${selectedFiles.length})`
          );

          const invokeParams = {
            ip: targetIp,
            port: targetPort,
            path: filePath,
            fileIndex: i,
            totalFiles: selectedFiles.length,
            fileName: f.name,
            totalSize: totalSize,
            batchId: batchId // Usa batchId (camelCase) per compatibilità con Tauri
          };
          
          // Log dettagliato dei parametri inviati
          console.log('🔍 [FileTransfer] Parametri invoke completi:', JSON.stringify(invokeParams, null, 2));
          console.log('🔍 [FileTransfer] Tipo di batchId:', typeof batchId, 'Valore:', batchId);
          console.log('🔍 [FileTransfer] batchId è stringa vuota?', batchId === '');
          console.log('🔍 [FileTransfer] batchId è null/undefined?', batchId == null);
          
          await invoke('send_file_with_progress', invokeParams);
        }
        toast.success(t("transfer_success", { device: deviceKey }));
      } catch (err) {
        console.error('❌ [FileTransfer] Errore durante invio verso', deviceKey, 'con batchId:', batchId, err);
        console.error('❌ [FileTransfer] Stack trace:', err);
        toast.error(t("transfer_error", { device: deviceKey }));

        // Log dettagliato dell'errore per debug
        if (err instanceof Error) {
          console.error('❌ [FileTransfer] Error details:', {
            message: err.message,
            name: err.name,
            stack: err.stack,
            batchId: batchId,
            deviceKey: deviceKey
          });
        }
        
        // Log dell'errore con batch_id per tracciabilità
        console.error(`🔗 [FileTransfer] Errore nel batch ${batchId} per dispositivo ${deviceKey}`);
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
    setGeneralProgress({});
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
            {selectedDevices.map(deviceRef => {
              // Trova device in allDevices per ottenere IP e porta corretti
              const deviceId = typeof deviceRef === 'string' ? deviceRef : (deviceRef as any)?.id ?? (deviceRef as any)?.ip ?? String(deviceRef ?? '');
              const foundDevice = allDevices.find(d => d.id === deviceId);
              let ip: string;
              let port: number;
              let name: string;
              if (foundDevice) {
                const device = foundDevice as Device;
                ip = device.ip;
                port = typeof device.port === "string" ? parseInt(device.port, 10) || 40124 : device.port ?? 40124;
                name = device.name ?? "Dispositivo";
              } else if (typeof deviceId === 'string' && deviceId.includes(':')) {
                const [parsedIp, parsedPort] = deviceId.split(':');
                ip = parsedIp;
                port = parseInt(parsedPort, 10) || 40124;
                name = "Dispositivo";
              } else {
                ip = String(deviceId);
                port = 40124;
                name = "Dispositivo";
              }
              const key = `${ip}:${port}`;

              return (
                <div key={deviceId} className="text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">{`${name} (${ip})`}</span>
                    {isUploading && generalProgress[key] !== undefined && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1 bg-gray-700/60 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-slate-400 transition-all duration-300"
                              style={{ width: `${generalProgress[key].percent}%` }}
                            />
                          </div>
                          <span className="text-gray-400 text-xs w-8">{generalProgress[key].percent}%</span>
                        </div>
                        {generalProgress[key].eta && generalProgress[key].eta !== t("calculating_eta") && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/40 border border-slate-600/40">
                            <span className="text-slate-300 text-xs">⏱️</span>
                            <span className="text-slate-200 text-xs">{generalProgress[key].eta}</span>
                          </div>
                        )}
                        {generalProgress[key].eta === t("calculating_eta") && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-600/40 border border-slate-500/40">
                            <span className="text-slate-400 text-xs">⏳</span>
                            <span className="text-slate-300 text-xs">{t("calculating_eta")}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progress generale */}
                  {isUploading && generalProgress[key] && (
                    <div className="space-y-2 pl-2">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-xs">
                          {generalProgress[key].completedFiles}/{generalProgress[key].totalFiles} file completati
                        </span>
                        {generalProgress[key].currentFile && (
                          <span className="text-gray-500 text-xs truncate max-w-xs">
                            In corso: {generalProgress[key].currentFile}
                          </span>
                        )}
                      </div>
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
                    {t("remove_everything")}
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