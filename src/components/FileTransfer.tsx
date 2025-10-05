import { useState, useCallback, useEffect } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress?: number;
  path?: string;
}

interface FileTransferProps {
  selectedDevices: any[];
}

export function FileTransfer({ selectedDevices }: FileTransferProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Listen to backend transfer events and update UI
  useEffect(() => {
    const progressListener = listen('transfer_progress', (event) => {
      const payload: any = event.payload;
      if (!payload) return;
      // Only handle 'send' direction for uploads initiated by this client
      if (payload.direction === 'send') {
        // Update any file currently uploading that matches the target ip
        setFiles(prev => prev.map(f => {
          if (f.status === 'uploading') {
            // Try to match by device ip (best-effort)
            const targetIp = payload.ip;
            if (targetIp && selectedDevices.some(d => d.ip === targetIp)) {
              return { ...f, progress: Math.round(payload.percent || 0) };
            }
          }
          return f;
        }));
      }
    });

    const completeListener = listen('transfer_complete', (event) => {
      const payload: any = event.payload;
      if (!payload) return;
      if (payload.direction === 'send') {
        const targetIp = payload.ip;
        setFiles(prev => prev.map(f => {
          if (f.status === 'uploading' && targetIp && selectedDevices.some(d => d.ip === targetIp)) {
            return { ...f, status: 'completed', progress: 100 };
          }
          return f;
        }));
      }
    });

    const logListener = listen('backend_log', (event) => {
      // Show backend logs in console for now
      console.debug('[backend_log]', event.payload);
    });

    return () => {
      progressListener.then(un => un());
      completeListener.then(un => un());
      logListener.then(un => un());
    };
  }, [selectedDevices]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newFiles: FileItem[] = droppedFiles.map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileSelect = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });
      
      if (selected && Array.isArray(selected)) {
        const newFiles: FileItem[] = selected.map((filePath, index) => {
          const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'Unknown';
          return {
            id: `file-${Date.now()}-${index}`,
            name: fileName,
            size: 0, // We'll get the actual size from the backend
            type: 'unknown',
            status: 'pending',
            path: filePath,
          };
        });
        
        setFiles(prev => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('Error selecting files:', error);
    }
  }, []);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const startTransfer = async () => {
    if (selectedDevices.length === 0 || files.length === 0) return;
    
    for (const file of files) {
      if (file.status === 'pending' && file.path) {
        try {
          // Update file status to uploading
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: 'uploading', progress: 0 } : f
          ));
          
          // Send file to each selected device
          for (const device of selectedDevices) {
            // Use the backend's file server port (40124) and the expected parameter names
            await invoke('send_file', {
              ip: device.ip,
              port: device.port || 40124,
              file_path: file.path || file.path,
            });
          }
          
          // Mark as completed
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: 'completed', progress: 100 } : f
          ));
          
        } catch (error) {
          console.error('Error transferring file:', error);
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: 'error' } : f
          ));
        }
      }
    }
  };

  const getStatusIcon = (status: FileItem['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <GlassCard
        intensity={dragActive ? 'strong' : 'medium'}
        className={`p-8 border-2 border-dashed transition-all duration-300 ${
          dragActive 
            ? 'border-primary scale-[1.02] shadow-lg shadow-primary/20' 
            : selectedDevices.length > 0
              ? 'border-border hover:border-primary/50 hover:scale-[1.01]' 
              : 'border-muted opacity-60'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="text-center">
          <motion.div
            animate={{ 
              y: dragActive ? -5 : 0,
              scale: dragActive ? 1.1 : 1 
            }}
            transition={{ duration: 0.2 }}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors ${
              selectedDevices.length > 0 ? 'text-primary' : 'text-muted-foreground/50'
            }`} />
          </motion.div>
          
          {selectedDevices.length > 0 ? (
            <>
              <h3 className="mb-2">Trascina i file qui o</h3>
              <Button variant="outline" className="cursor-pointer" onClick={handleFileSelect}>
                Seleziona File Multipli
              </Button>
              <p className="text-muted-foreground text-sm mt-2">
                Invio verso: <span className="font-medium">
                  {selectedDevices.length === 1 
                    ? selectedDevices[0].name 
                    : `${selectedDevices.length} dispositivi selezionati`
                  }
                </span>
              </p>
            </>
          ) : (
            <>
              <h3 className="mb-2 text-muted-foreground">Seleziona un dispositivo</h3>
              <p className="text-muted-foreground text-sm">
                Scegli un dispositivo dalla lista per iniziare il trasferimento
              </p>
            </>
          )}
        </div>
      </GlassCard>

      {/* File List */}
      {files.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3>File da trasferire ({files.length})</h3>
            {selectedDevices.length > 0 && files.some(f => f.status === 'pending') && (
              <Button onClick={startTransfer} size="sm">
                Avvia Trasferimento
              </Button>
            )}
          </div>
          
          <div className="space-y-3">
            <AnimatePresence>
              {files.map((file, index) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/50 hover:border-border transition-all duration-200"
                >
                  <motion.div 
                    className="flex-shrink-0"
                    animate={{ 
                      rotate: file.status === 'uploading' ? 360 : 0 
                    }}
                    transition={{ 
                      duration: file.status === 'uploading' ? 2 : 0.3,
                      repeat: file.status === 'uploading' ? Infinity : 0,
                      ease: 'linear'
                    }}
                  >
                    {getStatusIcon(file.status)}
                  </motion.div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          className="flex-shrink-0 p-1 h-auto hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </motion.div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatFileSize(file.size)}</span>
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        <Badge variant="outline" className={`text-xs ${
                          file.status === 'completed' ? 'text-green-600 border-green-200' :
                          file.status === 'error' ? 'text-red-600 border-red-200' :
                          file.status === 'uploading' ? 'text-blue-600 border-blue-200' :
                          'border-border'
                        }`}>
                          {file.status === 'pending' && 'In attesa'}
                          {file.status === 'uploading' && 'Trasferimento...'}
                          {file.status === 'completed' && 'Completato'}
                          {file.status === 'error' && 'Errore'}
                        </Badge>
                      </motion.div>
                    </div>
                    
                    {file.status === 'uploading' && file.progress !== undefined && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-2"
                      >
                        <Progress value={file.progress} className="h-2" />
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </GlassCard>
      )}
    </div>
  );
}