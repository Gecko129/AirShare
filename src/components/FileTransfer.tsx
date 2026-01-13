import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Upload, X, File, Send, Users, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Device } from '../types/device';
import { useTranslation } from "react-i18next";
import { toast } from 'sonner';
import { IncomingTransfers } from './IncomingTransfers';

interface FileTransferProps {
  selectedDevices: string[];
  selectedFiles: UploadFile[];
  onFilesChange: (files: UploadFile[]) => void;
  onDevicesUpdate?: (callback: (devices: Device[]) => void) => void;
}

interface UploadFile {
  name: string;
  size: number;
  path?: string;
}

export function FileTransfer({ 
  selectedDevices, 
  selectedFiles,
  onFilesChange,
  onDevicesUpdate 
}: FileTransferProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadETA, setUploadETA] = useState<Record<string, string>>({});
  const [generalProgress, setGeneralProgress] = useState<Record<string, { percent: number; eta?: string; currentFile?: string; totalFiles: number; completedFiles: number }>>({});
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [cancelledTransfers, setCancelledTransfers] = useState<Set<string>>(new Set());

 
 
  // Ascolta gli eventi di progresso/completamento dal backend
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
          setUploadETA(prev => {
            const newETA = { ...prev };
            delete newETA[deviceKey];
            return newETA;
          });
        }
      });

      unlistenBackendLog = await listen('backend_log', (event: { payload: any }) => {
        const p = event.payload as any;
        const level = p?.level ?? 'info';
        const msg = String(p?.message ?? '');
        console.log(`[backend][${level}]`, msg);

        if (msg.includes("…")) return;

        const overallProgressRegex = /^(?<direction>send|recv) progress \| id=(?<id>[^ ]+) ip=(?<ip>[^ ]+) port=(?<port>[^ ]+) overall_sent=(?<overall_sent>\d+) overall_total=(?<overall_total>\d+) overall_percent=(?<overall_percent>[\d.]+) overall_eta=(?<overall_eta>.+?)(?: batch_id=(?<batch_id>[^ ]+))?$/;
        const overallMatch = msg.match(overallProgressRegex);
        
        if (msg.includes('overall_sent')) {
          console.log('🔍 [DEBUG] Parsing overall progress log:', msg);
          console.log('🔍 [DEBUG] Overall match:', overallMatch);
        }
         
        const progressRegex = /^(?<direction>send|recv) progress \| id=(?<id>[^ ]+) ip=(?<ip>[^ ]+) port=(?<port>[^ ]+) (?:sent|received)=(?<sent>\d+) total=(?<total>\d+) percent=(?<percent>[\d.]+)(?: eta=(?<eta>.+?))? file=(?<file>.+?)(?: \((?<index>\d+)\/(?<count>\d+)\))?$/;
        const match = msg.match(progressRegex);

        if (overallMatch && overallMatch.length >= 9) {
          const direction = overallMatch[1];
          const ip = overallMatch[3];
          const port = overallMatch[4];
          const overall_percent = overallMatch[7];
          const overall_eta = overallMatch[8];
          
          if (direction === 'send' && ip && port && overall_percent) {
            const deviceKey = `${ip}:${port}`;
            const percentNum = Number(overall_percent);
            const percentClamped = Math.max(0, Math.min(100, Math.round(percentNum)));
            
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
          
          if (direction === 'send' && ip && port && percent) {
            const deviceKey = `${ip}:${port}`;
            const percentNum = Number(percent);
            const percentClamped = Math.max(0, Math.min(100, Math.round(percentNum)));
            const totalFiles = count ? parseInt(count, 10) : selectedFiles.length;
            const completedFiles = index ? parseInt(index, 10) - 1 : 0;
            
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
            setUploadETA(prev => {
              if (eta) {
                return { ...prev, [deviceKey]: eta };
              }
              if (prev[deviceKey] && prev[deviceKey] !== t("calculating_eta")) {
                return prev;
              }
              return { ...prev, [deviceKey]: t("calculating_eta") };
            });
          }
          return;
        }

        const completeMatch = msg.match(/^send complete \| id=([^ ]+) ip=([^ ]+) port=([^ ]+) path=([^ ]+) file=([^ ]+)(?: \((\d+)\/(\d+)\))?$/);
        if (completeMatch) {
          const ip = completeMatch[2];
          const port = completeMatch[3];
          const currentFileIndex = completeMatch[6] ? parseInt(completeMatch[6], 10) - 1 : 0;
          const totalFiles = completeMatch[7] ? parseInt(completeMatch[7], 10) : selectedFiles.length;
          
          if (ip && port) {
            const deviceKey = `${ip}:${port}`;
            
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
  }, [selectedFiles.length]);

  useEffect(() => {
    if (!onDevicesUpdate) return;
    const updateNames = (devices: Device[]) => {
      setAllDevices(devices);
    };
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
        path: typeof f.path === 'string' ? f.path : undefined,
      });
    }
    onFilesChange([...selectedFiles, ...dropped]);
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
    console.log(t('file_dialog_opening'));
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
        onFilesChange([...selectedFiles, item]);
      } catch (error) {
        console.error("Errore nel leggere le informazioni del file:", error);
        const item: UploadFile = {
          name: path.split(/[\\/]/).pop() || 'file',
          size: 0,
          path,
        };
        onFilesChange([...selectedFiles, item]);
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

  function generateBatchId() {
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID();
    }
    return `batch_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }

  const handleSend = async () => {
    if (selectedFiles.length === 0 || selectedDevices.length === 0) return;

    const batchId = generateBatchId();
    
    if (!batchId || batchId.trim() === '') {
      console.error('❌ [FileTransfer] Errore: batchId generato è vuoto o null');
      toast.error('Errore nella generazione del batch ID');
      return;
    }
    
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
      let targetIp = '';
      let targetPort = 0;
      const deviceId = typeof deviceRef === 'string' ? deviceRef : (deviceRef?.id ?? deviceRef?.ip ?? String(deviceRef ?? ''));
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

      const deviceKey = `${targetIp}:${targetPort}`;

      setUploadProgress(prev => ({ ...prev, [deviceKey]: 0 }));
      setUploadETA(prev => ({ ...prev, [deviceKey]: t("calculating_eta") }));
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
        const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
        for (let i = 0; i < selectedFiles.length; i++) {
          const f = selectedFiles[i];
          const filePath = f.path || f.name;
          if (!f.path) {
            console.warn('⚠️ [FileTransfer] Path mancante per', f.name, '-', t('select_file_button_hint'));
          }

          console.log(
            `[FileTransfer] Invio file (batchId=${batchId}, deviceKey=${deviceKey}, fileIndex=${i}, fileName=${f.name})`
          );
          console.log(
            `➡️ [FileTransfer] Sending batchId to backend with file:`, { batchId, deviceKey, fileName: f.name }
          );
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
            batchId: batchId
          };
          
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

        if (err instanceof Error) {
          console.error('❌ [FileTransfer] Error details:', {
            message: err.message,
            name: err.name,
            stack: err.stack,
            batchId: batchId,
            deviceKey: deviceKey
          });
        }
        
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
    onFilesChange([]);
    setUploadProgress({});
    setUploadETA({});
    setGeneralProgress({});
  };

  const handleCancelSend = async (deviceKey: string) => {
    try {
      const [ip, port] = deviceKey.split(':');
      await invoke('cancel_transfer_send', { 
        target_ip: ip,
        target_port: parseInt(port, 10)
      });
      setCancelledTransfers(prev => new Set([...prev, deviceKey]));
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[deviceKey];
        return newProgress;
      });
      setUploadETA(prev => {
        const newETA = { ...prev };
        delete newETA[deviceKey];
        return newETA;
      });
      setGeneralProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[deviceKey];
        return newProgress;
      });
      toast.info(`Invio verso ${deviceKey} annullato`);
    } catch (error) {
      console.error('Errore durante l\'annullamento:', error);
      toast.error('Errore nell\'annullamento del trasferimento');
    }
  };

  const removeFile = (index?: number) => {
    if (typeof index === 'number') {
      onFilesChange(selectedFiles.filter((_, i) => i !== index));
    } else {
      onFilesChange([]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('size_units.bytes')}`;
    const k = 1024;
    const sizes = [t('size_units.bytes'), t('size_units.kb'), t('size_units.mb'), t('size_units.gb')];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const canSend = selectedFiles.length > 0 && selectedDevices.length > 0 && !isUploading;

  return (
    <>
      <Card className="backdrop-blur-md bg-white/70 border border-slate-200 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm">
            <Upload className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h2 className="text-slate-900">{t("file_transfer_title")}</h2>
            <p className="text-slate-600 text-sm">{t("file_transfer_description")}</p>
          </div>
        </div>

        {/* Dispositivi di destinazione */}
        {selectedDevices.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-slate-700" />
              <span className="text-slate-800 text-sm">
                {t("sending_to_devices", { count: selectedDevices.length })}
              </span>
            </div>
            <div className="space-y-2">
              {selectedDevices.map(deviceRef => {
                const deviceId = typeof deviceRef === 'string' ? deviceRef : (deviceRef as any)?.id ?? (deviceRef as any)?.ip ?? String(deviceRef ?? '');
                const foundDevice = allDevices.find(d => d.id === deviceId);
                let ip: string;
                let port: number;
                let name: string;
                
                if (foundDevice) {
                  const device = foundDevice as Device;
                  ip = device.ip;
                  port = typeof device.port === "string" ? parseInt(device.port, 10) || 40124 : device.port ?? 40124;
                  name = device.name ?? t('device.default_name');
                } else if (typeof deviceId === 'string' && deviceId.includes(':')) {
                  const [parsedIp, parsedPort] = deviceId.split(':');
                  ip = parsedIp;
                  port = parseInt(parsedPort, 10) || 40124;
                  name = t('device.default_name');
                } else {
                  ip = String(deviceId);
                  port = 40124;
                  name = t('device.default_name');
                }
                const key = `${ip}:${port}`;

                return (
                  <div key={deviceId} className="text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-800">{`${name} (${ip})`}</span>
                      <div className="flex items-center gap-2">
                        {isUploading && generalProgress[key] !== undefined && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-slate-600 transition-all duration-300"
                                  style={{ width: `${generalProgress[key].percent}%` }}
                                />
                              </div>
                              <span className="text-slate-600 text-xs w-8">{generalProgress[key].percent}%</span>
                            </div>
                            {generalProgress[key].eta && generalProgress[key].eta !== t("calculating_eta") && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">
                                <span className="text-slate-700 text-xs">⏱️</span>
                                <span className="text-slate-700 text-xs">{generalProgress[key].eta}</span>
                              </div>
                            )}
                            {generalProgress[key].eta === t("calculating_eta") && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">
                                <span className="text-slate-600 text-xs">⏳</span>
                                <span className="text-slate-700 text-xs">{t("calculating_eta")}</span>
                              </div>
                            )}
                            <Button
                              onClick={() => handleCancelSend(key)}
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title={t('send_file_with_progress.cancel_tooltip')}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isUploading && generalProgress[key] && (
                      <div className="space-y-2 pl-2">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 text-xs">
                            {generalProgress[key].completedFiles}/{generalProgress[key].totalFiles} {t('send_file_with_progress.files_completed')}
                          </span>
                          {generalProgress[key].currentFile && (
                            <span className="text-gray-500 text-xs truncate max-w-xs">
                              {t('send_file_with_progress.in_progress')}: {generalProgress[key].currentFile}
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
          id="file-drop-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleFileDialog}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
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
                <div className="p-4 rounded-full bg-slate-100 w-fit mx-auto">
                  <Upload className="w-8 h-8 text-slate-600" />
                </div>
                <div>
                  <p className="text-slate-800">{t("drop_file_text")}</p>
                  <p className="text-slate-600 text-sm mt-1">{t("drop_file_subtext")}</p>
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
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-3">
                        <File className="w-6 h-6 text-slate-700" />
                        <div className="text-left">
                          <p className="text-slate-800 truncate max-w-xs">{f.name}</p>
                          <p className="text-slate-600 text-sm">{formatFileSize(f.size)}</p>
                        </div>
                      </div>
                      <Button
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        variant="ghost"
                        size="sm"
                        className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
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
                      className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
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

        {selectedFiles.length > 0 && selectedDevices.length === 0 && (
          <div className="mt-4 p-3 rounded-lg bg-orange-50 border border-orange-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <span className="text-orange-700 text-sm">{t("no_device_selected")}</span>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 shadow-lg backdrop-blur-sm disabled:opacity-50"
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

      {/* Incoming Transfers Section */}
      <IncomingTransfers />
    </>
  );
}
