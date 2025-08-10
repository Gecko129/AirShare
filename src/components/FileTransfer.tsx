import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Upload, X, File, Send, Users, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FileTransferProps {
  selectedDevices: string[];
  onDevicesUpdate?: (devices: Device[]) => void;
}

export function FileTransfer({ selectedDevices, onDevicesUpdate }: FileTransferProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  // Aggiorna deviceNames quando onDevicesUpdate viene chiamato dal componente padre
  useEffect(() => {
    if (!onDevicesUpdate) return;
    const updateNames = (devices: Device[]) => {
      const names: Record<string, string> = {};
      devices.forEach(device => {
        names[device.id] = device.name;
      });
      setDeviceNames(names);
    };
    onDevicesUpdate(updateNames);
  }, [onDevicesUpdate]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleSend = async () => {
    if (!selectedFile || selectedDevices.length === 0) return;

    setIsUploading(true);
    setUploadProgress({});

    // Per ora, placeholder per IP e porta; in futuro recupera dal deviceId.
    // Esempio: deviceId = "192.168.1.10:9000"
    for (const deviceId of selectedDevices) {
      let targetIp = '';
      let targetPort = 0;
      if (deviceId.includes(':')) {
        const [ip, port] = deviceId.split(':');
        targetIp = ip;
        targetPort = parseInt(port, 10);
      } else {
        // fallback: deviceId as IP, porta di default
        targetIp = deviceId;
        targetPort = 9000;
      }
      try {
        setUploadProgress(prev => ({
          ...prev,
          [deviceId]: 0
        }));
        // Chiamata al backend Tauri
        await invoke('send_file', {
          filePath: (selectedFile as any).path, // .path solo se fornito da Tauri drag&drop
          targetIp,
          targetPort
        });
        // Aggiorna progresso al 100% dopo il completamento (placeholder, implementare progresso reale in futuro)
        setUploadProgress(prev => ({
          ...prev,
          [deviceId]: 100
        }));
      } catch (err) {
        // Log errore e imposta progresso a 0 o -1 (se vuoi mostrare errore)
        console.error(`Errore nell'invio a ${deviceId}:`, err);
        setUploadProgress(prev => ({
          ...prev,
          [deviceId]: 0
        }));
      }
    }

    // Breve attesa per mostrare completamento
    await new Promise(resolve => setTimeout(resolve, 500));

    setIsUploading(false);
    setSelectedFile(null);
    setUploadProgress({});

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const canSend = selectedFile && selectedDevices.length > 0 && !isUploading;

  return (
    <Card className="backdrop-blur-md bg-gray-900/40 border border-gray-700/50 shadow-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-full bg-gradient-to-r from-gray-700/40 to-slate-600/40 backdrop-blur-sm">
          <Upload className="w-6 h-6 text-gray-200" />
        </div>
        <div>
          <h2 className="text-gray-100">Trasferimento File</h2>
          <p className="text-gray-400 text-sm">Seleziona un file da condividere</p>
        </div>
      </div>

      {/* Dispositivi di destinazione */}
      {selectedDevices.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-slate-800/30 border border-slate-700/40">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-slate-300" />
            <span className="text-slate-200 text-sm">Invio a {selectedDevices.length} dispositivi:</span>
          </div>
          <div className="space-y-2">
            {selectedDevices.map(deviceId => (
              <div key={deviceId} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{deviceNames[deviceId] ? deviceNames[deviceId] : deviceId}</span>
                {isUploading && uploadProgress[deviceId] !== undefined && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1 bg-gray-700/60 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-slate-400 transition-all duration-300"
                        style={{ width: `${uploadProgress[deviceId]}%` }}
                      />
                    </div>
                    <span className="text-gray-400 text-xs w-8">{uploadProgress[deviceId]}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File drop area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragging 
            ? 'border-slate-500/60 bg-slate-700/20' 
            : 'border-gray-600/50 hover:border-gray-500/70 hover:bg-gray-800/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept="*/*"
        />

        <AnimatePresence mode="wait">
          {!selectedFile ? (
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
                <p className="text-gray-200">Trascina un file qui o clicca per selezionarlo</p>
                <p className="text-gray-500 text-sm mt-1">Qualsiasi tipo di file è supportato</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="file-preview"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-gray-800/40">
                <File className="w-8 h-8 text-slate-300" />
                <div className="text-left">
                  <p className="text-gray-200 truncate max-w-xs">{selectedFile.name}</p>
                  <p className="text-gray-400 text-sm">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-gray-200 hover:bg-gray-700/60"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Warning per nessun dispositivo selezionato */}
      {selectedFile && selectedDevices.length === 0 && (
        <div className="mt-4 p-3 rounded-lg bg-orange-900/40 border border-orange-700/40 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-400" />
          <span className="text-orange-300 text-sm">Seleziona almeno un dispositivo per inviare il file</span>
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
                Invio in corso...
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
                Invia a {selectedDevices.length} dispositivi
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </Card>
  );
}
