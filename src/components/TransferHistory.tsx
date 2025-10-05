import { useState, useMemo } from 'react';
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
  Filter,
  CalendarDays,
  ArrowUpDown,
  MoreHorizontal,
  Trash2,
  RotateCcw,
  Share2
} from 'lucide-react';
import { motion } from 'motion/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

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

// Mock data for demonstration
const mockTransfers: TransferRecord[] = [
  {
    id: '1',
    fileName: 'Vacation_Photos_2024.zip',
    fileSize: 2.4 * 1024 * 1024 * 1024, // 2.4 GB
    type: 'sent',
    status: 'completed',
    fromDevice: 'MacBook Pro',
    toDevice: 'iPhone 15 Pro',
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    duration: 180,
    speed: 127.5,
    deviceType: 'mobile'
  },
  {
    id: '2',
    fileName: 'Project_Presentation.pptx',
    fileSize: 45 * 1024 * 1024, // 45 MB
    type: 'received',
    status: 'completed',
    fromDevice: 'Dell XPS 13',
    toDevice: 'MacBook Pro',
    startTime: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
    duration: 12,
    speed: 98.2,
    deviceType: 'desktop'
  },
  {
    id: '3',
    fileName: 'Video_Tutorial_4K.mp4',
    fileSize: 1.8 * 1024 * 1024 * 1024, // 1.8 GB
    type: 'sent',
    status: 'failed',
    fromDevice: 'MacBook Pro',
    toDevice: 'Android Tablet',
    startTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    duration: 0,
    speed: 0,
    deviceType: 'mobile'
  },
  {
    id: '4',
    fileName: 'Document_Archive.pdf',
    fileSize: 125 * 1024 * 1024, // 125 MB
    type: 'received',
    status: 'completed',
    fromDevice: 'Surface Pro',
    toDevice: 'MacBook Pro',
    startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    duration: 45,
    speed: 89.3,
    deviceType: 'desktop'
  },
  {
    id: '5',
    fileName: 'Music_Collection.zip',
    fileSize: 850 * 1024 * 1024, // 850 MB
    type: 'sent',
    status: 'cancelled',
    fromDevice: 'MacBook Pro',
    toDevice: 'iPhone 13',
    startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    duration: 0,
    speed: 0,
    deviceType: 'mobile'
  }
];

export function TransferHistory() {
  const [transfers] = useState<TransferRecord[]>(mockTransfers);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'failed' | 'cancelled'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'speed'>('date');

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

    if (diffDays > 0) return `${diffDays} giorni fa`;
    if (diffHours > 0) return `${diffHours} ore fa`;
    return 'Poco fa';
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

  const getStatusBadge = (status: TransferRecord['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-200">Completato</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-red-600 border-red-200">Fallito</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-200">Annullato</Badge>;
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
            <h2 className="text-xl mb-2">Cronologia Trasferimenti</h2>
            <p className="text-muted-foreground">
              Visualizza e gestisci tutti i tuoi trasferimenti file
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="text-center">
              <div className="font-semibold">{totalTransfers}</div>
              <div className="text-sm text-muted-foreground">Totali</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{completedTransfers}</div>
              <div className="text-sm text-muted-foreground">Completati</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{formatFileSize(totalDataTransferred)}</div>
              <div className="text-sm text-muted-foreground">Trasferiti</div>
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
                placeholder="Cerca file, dispositivi..."
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
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="sent">Inviati</SelectItem>
                <SelectItem value="received">Ricevuti</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti Stati</SelectItem>
                <SelectItem value="completed">Completati</SelectItem>
                <SelectItem value="failed">Falliti</SelectItem>
                <SelectItem value="cancelled">Annullati</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-32">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Data</SelectItem>
                <SelectItem value="size">Dimensione</SelectItem>
                <SelectItem value="speed">Velocità</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* Transfer List */}
      <GlassCard className="p-4">
        <div className="space-y-4">
          {filteredTransfers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nessun trasferimento trovato</p>
              <p className="text-sm">Prova a modificare i filtri di ricerca</p>
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
                  {transfer.status === 'failed' && (
                    <div className="text-red-500">Trasferimento fallito</div>
                  )}
                  {transfer.status === 'cancelled' && (
                    <div className="text-yellow-500">Annullato dall'utente</div>
                  )}
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {transfer.status === 'failed' && (
                      <DropdownMenuItem>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Riprova Trasferimento
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem>
                      <Share2 className="w-4 h-4 mr-2" />
                      Condividi di Nuovo
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Rimuovi dalla Cronologia
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}