import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from './GlassCard';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Search, 
  Download, 
  Upload, 
  File, 
  Smartphone, 
  Monitor, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  ArrowUpDown,
  Trash2
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle,
  AlertDialogTrigger
} from './ui/alert-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface TransferRecord {
  id: string;
  fileName: string;
  fileSize: number;
  type: 'sent' | 'received';
  status: 'completed' | 'failed' | 'cancelled';
  fromDevice: string;
  toDevice: string;
  startTime: Date;
  duration: number; // in seconds
  speed: number; // MB/s
  deviceType: 'mobile' | 'desktop';
}

interface BackendTransferRecord {
  id: string;
  fileName: string;
  fileSize: number;
  type: 'sent' | 'received'; // <-- was transferType
  status: 'completed' | 'cancelled' | 'failed';
  fromDevice: string;
  toDevice: string;
  startTime: string;
  duration: number;
  speed: number;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export function TransferHistory() {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'failed' | 'cancelled'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'speed'>('date');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transferToDelete, setTransferToDelete] = useState<TransferRecord | null>(null);

  const loadTransfers = async () => {
    try {
      const data = await invoke<BackendTransferRecord[]>('get_recent_transfers');
      const parsed = data.map(t => ({
        id: t.id,
        fileName: t.fileName,
        fileSize: t.fileSize,
        type: t.type, // <-- was t.transferType
        status: t.status,
        fromDevice: t.fromDevice,
        toDevice: t.toDevice,
        startTime: new Date(t.startTime),
        duration: t.duration,
        speed: t.speed,
        deviceType: (t.deviceType === 'desktop' ? 'desktop' : 'mobile') as 'mobile' | 'desktop',
      }));
      setTransfers(parsed);
      console.log('Loaded transfers:', parsed.length);
    } catch (e) {
      console.error('Failed to load transfers:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Carica trasferimenti al mount
  useEffect(() => {
    loadTransfers();
  }, []);

  // Ascolta eventi di completamento trasferimento per ricaricare i dati
  useEffect(() => {
    let unlistenComplete: (() => void) | undefined;
    (async () => {
      unlistenComplete = await listen('transfer_complete', () => {
        loadTransfers();
      });
    })();
    return () => {
      if (unlistenComplete) unlistenComplete();
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '-';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return t('history.days_ago', { count: diffDays });
    if (diffHours > 0) return t('history.hours_ago', { count: diffHours });
    return t('history.just_now');
  };

  const getStatusIcon = (status: TransferRecord['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'cancelled':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return t('history.status.completed');
      case 'cancelled':
        return t('history.status.cancelled');
      case 'failed':
        return t('history.status.failed');
      default:
        return status;
    }
  };

  const getStatusBadge = (status: TransferRecord['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-200">{t('history.status.completed')}</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-red-600 border-red-200">{t('history.status.failed')}</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-200">{t('history.status.cancelled')}</Badge>;
    }
  };

  const filteredTransfers = useMemo(() => {
    let filtered = transfers.filter(transfer => {
      const matchesSearch = transfer.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           transfer.fromDevice.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           transfer.toDevice.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'all' || transfer.type === filterType;
      const matchesStatus = filterStatus === 'all' || transfer.status === filterStatus;

      return matchesSearch && matchesType && matchesStatus;
    });

    // Sort transfers
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return b.startTime.getTime() - a.startTime.getTime();
        case 'size':
          return b.fileSize - a.fileSize;
        case 'speed':
          return b.speed - a.speed;
        default:
          return 0;
      }
    });

    return filtered;
  }, [transfers, searchTerm, filterType, filterStatus, sortBy]);

  const totalTransfers = transfers.length;
  const completedTransfers = transfers.filter(t => t.status === 'completed').length;
  const totalDataTransferred = transfers
    .filter(t => t.status === 'completed')
    .reduce((acc, t) => acc + t.fileSize, 0);

  const handleDeleteTransfer = async (transferId: string) => {
    try {
      await invoke('delete_recent_transfer', { transfer_id: transferId });
      setTransfers(prev => prev.filter(t => t.id !== transferId));
    } catch (error) {
      console.error('Errore nell\'eliminazione:', error);
    }
  };

  const handleDeleteConfirm = async () => {
    if (transferToDelete) {
      try {
        await invoke('delete_recent_transfer', { transferId: transferToDelete.id });
        setTransfers(prev => prev.filter(t => t.id !== transferToDelete.id));
      } catch (e) {
        console.error('Failed to delete transfer:', e);
      }
    }
    setDeleteDialogOpen(false);
    setTransferToDelete(null);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setTransferToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl mb-2">{t('history.title')}</h2>
            <p className="text-muted-foreground">{t('history.subtitle')}</p>
          </div>
          
          <div className="flex gap-4">
            <div className="text-center">
              <div className="font-semibold">{totalTransfers}</div>
              <div className="text-sm text-muted-foreground">{t('history.stats.total')}</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{completedTransfers}</div>
              <div className="text-sm text-muted-foreground">{t('history.stats.completed')}</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{formatFileSize(totalDataTransferred)}</div>
              <div className="text-sm text-muted-foreground">{t('history.stats.transferred')}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters and Search */}
      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('history.search_placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('history.filters.all')}</SelectItem>
                <SelectItem value="sent">{t('history.filters.sent')}</SelectItem>
                <SelectItem value="received">{t('history.filters.received')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('history.filters.all_status')}</SelectItem>
                <SelectItem value="completed">{t('history.status.completed')}</SelectItem>
                <SelectItem value="failed">{t('history.status.failed')}</SelectItem>
                <SelectItem value="cancelled">{t('history.status.cancelled')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-32">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">{t('history.sort.date')}</SelectItem>
                <SelectItem value="size">{t('history.sort.size')}</SelectItem>
                <SelectItem value="speed">{t('history.sort.speed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* Transfer List */}
      <GlassCard className="p-4">
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p>{t('history.loading')}</p>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('history.empty.title')}</p>
              <p className="text-sm">{t('history.empty.subtitle')}</p>
            </div>
          ) : (
            filteredTransfers.map((transfer, index) => (
              <motion.div
                key={transfer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="flex items-center gap-4 p-4 bg-background rounded-lg border border-border/50 hover:border-border transition-colors"
              >
                {/* Status and Type Icon */}
                <div className="flex flex-col items-center gap-1">
                  {getStatusIcon(transfer.status)}
                  {transfer.type === 'sent' ? (
                    <Upload className="w-3 h-3 text-blue-500" />
                  ) : (
                    <Download className="w-3 h-3 text-green-500" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">{transfer.fileName}</p>
                    {getStatusBadge(transfer.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{formatFileSize(transfer.fileSize)}</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      {transfer.deviceType === 'mobile' ? (
                        <Smartphone className="w-3 h-3" />
                      ) : (
                        <Monitor className="w-3 h-3" />
                      )}
                      <span>{transfer.fromDevice} → {transfer.toDevice}</span>
                    </div>
                    <span>•</span>
                    <span>{formatTimeAgo(transfer.startTime)}</span>
                  </div>
                </div>

                {/* Transfer Stats */}
                <div className="text-right text-sm">
                  {transfer.status === 'completed' && (
                    <>
                      <div className="font-medium">{transfer.speed.toFixed(1)} MB/s</div>
                      <div className="text-muted-foreground">{formatDuration(transfer.duration)}</div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Status Badge */}
                  <Badge className={`${getStatusColor(transfer.status)} border`}>
                    {getStatusLabel(transfer.status)}
                  </Badge>
                  
                  {/* Delete Button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('history.delete.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('history.delete.description')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteTransfer(transfer.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {t('common.confirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}