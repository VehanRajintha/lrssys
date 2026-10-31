'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { CusDecRecord, Settings, QueueStatus, Stats, TallyResult, TallyRecord } from '@/lib/types';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// Lucide icons
import {
  Ship,
  FileText,
  Upload,
  FolderArchive,
  Sparkles,
  Download,
  Trash2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  Play,
  Pause,
  XCircle,
  Sun,
  Moon,
  QrCode,
  Settings as SettingsIcon,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Save,
  ArrowRight,
  ChevronRight,
  Activity,
  Check,
  X,
  FileCheck2,
  FileClock,
  Layers,
  Sliders,
  ExternalLink,
  Copy,
  ScanLine,
  ArrowUpRight,
  HardDrive,
  Lock,
  Cpu,
  Zap,
  Clock,
  Loader2
} from 'lucide-react';

export interface WorkerStreamState {
  id: number;
  status: 'idle' | 'extracting' | 'completed' | 'error';
  fileName?: string;
  step?: string;
  progress: number;
  completedInStream: number;
  lastRecord?: {
    stampNo?: string;
    customsRef?: string;
    consignee?: string;
    confidence?: number;
    isDuplicate?: boolean;
  };
}

interface Toast {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  message: string;
  subtext?: string;
}

export default function LrsysPortal() {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Navigation: Declarations vs Tally
  const [activeSection, setActiveSection] = useState<'ocr' | 'tally'>('ocr');

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'info' | 'error' = 'info', subtext?: string) => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).substring(2, 5);
    setToasts(prev => [...prev.slice(-2), { id, type, message, subtext }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Drag and drop state
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  // Data State
  const [records, setRecords] = useState<CusDecRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CusDecRecord | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'VERIFIED' | 'CORRECTED' | 'DUPLICATES'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Skeleton Loading states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isStorageLoading, setIsStorageLoading] = useState(false);

  // Dynamic identification of duplicate records (strictly requires at least 3 matching critical fields)
  const duplicateIdSet = useMemo(() => {
    const dupIds = new Set<string>();
    const n = records.length;
    if (n <= 1) return dupIds;

    const seenGroup = new Set<number>();

    for (let i = 0; i < n; i++) {
      if (seenGroup.has(i)) continue;
      const primary = records[i];

      const pStamp = primary.greenStampNumber && primary.greenStampNumber !== '000000' && primary.greenStampNumber.length >= 4 
        ? primary.greenStampNumber.trim() 
        : null;
      const pRef = primary.customsRefNumber && primary.customsRefNumber !== 'UNKNOWN' && primary.customsRefNumber.length >= 4 
        ? primary.customsRefNumber.replace(/\s+/g, '').toUpperCase() 
        : null;
      const pConsignee = primary.consigneeName && primary.consigneeName !== 'UNKNOWN' && primary.consigneeName.length >= 3 
        ? primary.consigneeName.trim().toUpperCase() 
        : null;
      const pDeclarant = primary.declarantName && primary.declarantName !== 'NOT SPECIFIED' && primary.declarantName.length >= 3 
        ? primary.declarantName.trim().toUpperCase() 
        : null;
      const pDate = primary.customsDate && primary.customsDate.trim().length >= 6 
        ? primary.customsDate.trim() 
        : null;

      let groupHasDuplicates = false;

      for (let j = i + 1; j < n; j++) {
        if (seenGroup.has(j)) continue;
        const candidate = records[j];

        const cStamp = candidate.greenStampNumber && candidate.greenStampNumber !== '000000' && candidate.greenStampNumber.length >= 4 
          ? candidate.greenStampNumber.trim() 
          : null;
        const cRef = candidate.customsRefNumber && candidate.customsRefNumber !== 'UNKNOWN' && candidate.customsRefNumber.length >= 4 
          ? candidate.customsRefNumber.replace(/\s+/g, '').toUpperCase() 
          : null;
        const cConsignee = candidate.consigneeName && candidate.consigneeName !== 'UNKNOWN' && candidate.consigneeName.length >= 3 
          ? candidate.consigneeName.trim().toUpperCase() 
          : null;
        const cDeclarant = candidate.declarantName && candidate.declarantName !== 'NOT SPECIFIED' && candidate.declarantName.length >= 3 
          ? candidate.declarantName.trim().toUpperCase() 
          : null;
        const cDate = candidate.customsDate && candidate.customsDate.trim().length >= 6 
          ? candidate.customsDate.trim() 
          : null;

        let matchCount = 0;
        if (pStamp && cStamp && pStamp === cStamp) matchCount++;
        if (pRef && cRef && pRef === cRef) matchCount++;
        if (pConsignee && cConsignee && (pConsignee === cConsignee || pConsignee.includes(cConsignee) || cConsignee.includes(pConsignee))) matchCount++;
        if (pDeclarant && cDeclarant && (pDeclarant === cDeclarant || pDeclarant.includes(cDeclarant) || cDeclarant.includes(pDeclarant))) matchCount++;
        if (pDate && cDate && pDate === cDate) matchCount++;

        // Duplicate match: Must match primary identifiers (Stamp + Ref) AND at least one party/date (reaching >= 3 matching critical fields)
        const isMatch = (pStamp && cStamp && pStamp === cStamp && pRef && cRef && pRef === cRef && matchCount >= 3) ||
                        (primary.fileHash && candidate.fileHash && primary.fileHash === candidate.fileHash && (pStamp === cStamp || pRef === cRef));

        if (isMatch) {
          dupIds.add(candidate.id);
          seenGroup.add(j);
          groupHasDuplicates = true;
        }
      }

      if (groupHasDuplicates) {
        seenGroup.add(i); // Primary declaration remains clean and valid
      }
    }

    return dupIds;
  }, [records]);

  // Derived live ledger metrics (guaranteed 100% in sync with actual table records)
  const ledgerStats = useMemo(() => {
    const total = records.length;
    const verified = records.filter(r => r.status === 'VERIFIED').length;
    const needsReview = records.filter(r => r.status === 'NEEDS_REVIEW').length;
    const corrected = records.filter(r => r.status === 'CORRECTED').length;
    const duplicates = duplicateIdSet.size;
    const totalValid = verified + corrected;
    const accuracyRate = total > 0 ? (((totalValid) / total) * 100).toFixed(1) : '100.0';

    return {
      total,
      verified,
      needsReview,
      corrected,
      duplicates,
      accuracyRate: parseFloat(accuracyRate)
    };
  }, [records, duplicateIdSet]);

  // Remove all duplicate records from database & cache
  const handleRemoveDuplicates = async () => {
    if (duplicateIdSet.size === 0) {
      showToast('No duplicate declarations detected.', 'info');
      return;
    }
    if (!confirm(`Are you sure you want to clean up and remove ${duplicateIdSet.size} duplicate declaration(s)?`)) return;
    try {
      showToast('Removing duplicate records...', 'info');
      const res = await fetch('/api/records/delete-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(duplicateIdSet) })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Removed ${duplicateIdSet.size} duplicate declaration(s)`, 'success');
        await fetchRecords();
        await fetchStorageStats();
      } else {
        const fb = await fetch('/api/records/deduplicate', { method: 'POST' });
        const fbData = await fb.json();
        showToast(fbData.message || 'Duplicates cleaned up', 'success');
        await fetchRecords();
        await fetchStorageStats();
      }
    } catch (err: any) {
      showToast('Deduplication failed', 'error', err.message);
    }
  };

  // Quick edit form state
  const [editStamp, setEditStamp] = useState('');
  const [editRef, setEditRef] = useState('');
  const [editConsignee, setEditConsignee] = useState('');
  const [editDeclarant, setEditDeclarant] = useState('');

  // Parallel Worker Stream States (Apple iOS Live Activity style)
  const [workerStreams, setWorkerStreams] = useState<WorkerStreamState[]>([]);
  const [processingTelemetry, setProcessingTelemetry] = useState<{
    startTime: number;
    elapsedSeconds: number;
    docsPerMinute: number;
    etaSeconds: number;
  }>({
    startTime: 0,
    elapsedSeconds: 0,
    docsPerMinute: 0,
    etaSeconds: 0
  });

  // Queue state
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    isProcessing: false,
    isPaused: false,
    pendingCount: 0,
    inFlightCount: 0,
    completedCount: 0,
    failedCount: 0,
    totalCount: 0,
    progressPercent: 0
  });

  // Canvas Pan, Zoom & Rotation
  const [zoomScale, setZoomScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialPanRef = useRef({ x: 0, y: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tally state
  const [tallySource, setTallySource] = useState<'db' | 'upload'>('db');
  const [tallyF1File, setTallyF1File] = useState<File | null>(null);
  const [tallyF2File, setTallyF2File] = useState<File | null>(null);
  const [tallyResult, setTallyResult] = useState<TallyResult | null>(null);
  const [tallyFilter, setTallyFilter] = useState<'MATCHED' | 'UNMATCHED_F1' | 'UNMATCHED_F2'>('MATCHED');
  const [isTallyRunning, setIsTallyRunning] = useState(false);

  // Modals state
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isPurgingStorage, setIsPurgingStorage] = useState(false);
  const [confirmPurgeAction, setConfirmPurgeAction] = useState<'all' | 'orphans' | null>(null);
  const [storageStats, setStorageStats] = useState({
    provider: 'local' as 'supabase' | 'local' | 'hybrid',
    bucketName: 'cusdec-documents',
    totalFiles: 0,
    totalBytes: 0,
    totalFormatted: '0.00 B',
    quotaFormatted: '5 GB',
    percentUsed: 0,
    cloudFiles: 0,
    cloudBytes: 0,
    cloudFormatted: '0.00 B',
    localFiles: 0,
    localBytes: 0,
    localFormatted: '0.00 B'
  });
  const [lanUrl, setLanUrl] = useState('http://localhost:5000');
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Settings form
  const [settings, setSettings] = useState<Settings>({
    geminiApiKey: '',
    geminiBackupApiKey: '',
    customApiKey: '',
    useCustomApiKey: false,
    geminiModel: 'gemini-3.5-flash-lite',
    autoVerifyThreshold: 90,
    workerConcurrency: 6,
    consignorConsigneeMode: 'both',
    preserveLeadingZeros: true
  });

  // Hidden inputs refs
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Client-side real-time processing refs
  const isClientProcessingRef = useRef(false);
  const isClientPausedRef = useRef(false);
  const isClientCancelledRef = useRef(false);

  // -------------------------------------------------------------
  // INITIALIZATION & THEME
  // -------------------------------------------------------------
  useEffect(() => {
    const savedTheme = (localStorage.getItem('lrsys-theme') as 'dark' | 'light') || 'dark';
    setTheme(savedTheme);
    applyTheme(savedTheme);

    fetchRecords();
    fetchSettings();
    fetchSystemInfo();
    fetchStorageStats();

    // Start queue telemetry polling (only monitors if client is not actively processing)
    const interval = setInterval(async () => {
      // Periodically refresh storage stats smoothly
      fetchStorageStats();

      if (isClientProcessingRef.current) return;

      try {
        const res = await fetch('/api/queue/status', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.queue && data.queue.isProcessing) {
            setQueueStatus(data.queue);
            fetchRecords(false);
          }
        }
      } catch (err) {}
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Background stream synthesizer & active queue telemetry
  useEffect(() => {
    if (queueStatus.isProcessing && workerStreams.length === 0) {
      const concurrency = Math.max(1, settings.workerConcurrency || 6);
      setWorkerStreams(
        Array.from({ length: concurrency }, (_, i) => ({
          id: i + 1,
          status: 'extracting',
          step: 'Multi-threaded Vision OCR...',
          progress: 50,
          completedInStream: Math.floor(queueStatus.completedCount / concurrency)
        }))
      );
    }
  }, [queueStatus.isProcessing, workerStreams.length, settings.workerConcurrency, queueStatus.completedCount]);

  useEffect(() => {
    if (!queueStatus.isProcessing || processingTelemetry.startTime === 0) return;
    const interval = setInterval(() => {
      setProcessingTelemetry(prev => {
        if (!prev.startTime) return prev;
        const elapsed = Math.max(1, Math.floor((Date.now() - prev.startTime) / 1000));
        const totalDone = queueStatus.completedCount + queueStatus.failedCount;
        const dpm = elapsed > 0 ? Math.round((totalDone / elapsed) * 60) : 0;
        const remaining = Math.max(0, queueStatus.totalCount - totalDone);
        const eta = dpm > 0 ? Math.round((remaining / dpm) * 60) : 0;
        return {
          ...prev,
          elapsedSeconds: elapsed,
          docsPerMinute: dpm,
          etaSeconds: eta
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [queueStatus.isProcessing, queueStatus.completedCount, queueStatus.failedCount, queueStatus.totalCount, processingTelemetry.startTime]);

  const applyTheme = (t: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    localStorage.setItem('lrsys-theme', nextTheme);
    showToast(`Switched to ${nextTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}`, 'info');
  };

  // Keyboard navigation & search shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (isInspectionModalOpen) {
          setIsInspectionModalOpen(false);
          return;
        }
        setIsMobileModalOpen(false);
        setIsSettingsModalOpen(false);
        setIsStorageModalOpen(false);
        return;
      }

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        selectNextRecord();
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        selectPrevRecord();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // -------------------------------------------------------------
  // DATA FETCHING
  // -------------------------------------------------------------
  const fetchRecords = async (updateSelection = true, showTableLoading = false) => {
    if (showTableLoading) setIsTableLoading(true);
    try {
      const q = searchTerm.trim();
      const url = `/api/records?status=ALL${q ? `&search=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.records)) {
          setRecords(prev => {
            // Guard against wiping newly-streamed items during active client ingestion
            if (isClientProcessingRef.current && prev.length > (data.records?.length || 0)) {
              return prev;
            }
            return data.records || [];
          });
        }

        if (updateSelection && data.records?.length > 0) {
          setSelectedRecord(prev => {
            if (!prev) return data.records[0];
            const updated = data.records.find((r: CusDecRecord) => r.id === prev.id);
            return updated || data.records[0];
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch records:', err);
    } finally {
      setIsInitialLoading(false);
      if (showTableLoading) setIsTableLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {}
  };

  const fetchSystemInfo = async () => {
    try {
      const res = await fetch('/api/system/info');
      if (res.ok) {
        const data = await res.json();
        setLanUrl(data.primaryLanUrl || `http://localhost:${data.port}`);
      }
    } catch (err) {}
  };

  const fetchStorageStats = async (showLoading = false) => {
    if (showLoading) setIsStorageLoading(true);
    try {
      const res = await fetch('/api/storage/stats');
      if (res.ok) {
        const data = await res.json();
        setStorageStats(data);
      }
    } catch (err) {
    } finally {
      if (showLoading) setIsStorageLoading(false);
    }
  };

  const handlePurgeStorage = async (action: 'all' | 'orphans') => {
    try {
      setIsPurgingStorage(true);
      const res = await fetch('/api/storage/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to purge storage');
      showToast(data.message, 'success');
      if (data.stats) setStorageStats(data.stats);
      setConfirmPurgeAction(null);
      setIsStorageModalOpen(false);
      fetchRecords(false);
    } catch (err: any) {
      showToast('Storage purge failed', 'error', err.message);
    } finally {
      setIsPurgingStorage(false);
    }
  };

  // -------------------------------------------------------------
  // SELECTION & QUICK EDIT
  // -------------------------------------------------------------
  const selectRecord = (record: CusDecRecord) => {
    setSelectedRecord(record);
    setEditStamp(String(record.greenStampNumber || '').padStart(6, '0'));
    setEditRef(record.customsRefNumber || '');
    setEditConsignee(record.consigneeName || '');
    setEditDeclarant(record.declarantName || '');
    resetZoom();
  };

  const openInspectionModal = (record: CusDecRecord) => {
    setIsImageLoading(true);
    selectRecord(record);
    setIsInspectionModalOpen(true);
  };

  useEffect(() => {
    setIsImageLoading(true);
  }, [selectedRecord?.id, selectedRecord?.imageUrl]);

  useEffect(() => {
    if (selectedRecord) {
      setEditStamp(String(selectedRecord.greenStampNumber || '').padStart(6, '0'));
      setEditRef(selectedRecord.customsRefNumber || '');
      setEditConsignee(selectedRecord.consigneeName || '');
      setEditDeclarant(selectedRecord.declarantName || '');
    }
  }, [selectedRecord]);

  const filteredRecords = records.filter(r => {
    if (filter === 'NEEDS_REVIEW') return r.status === 'NEEDS_REVIEW';
    if (filter === 'VERIFIED') return r.status === 'VERIFIED';
    if (filter === 'CORRECTED') return r.status === 'CORRECTED';
    if (filter === 'DUPLICATES') return duplicateIdSet.has(r.id);
    return true;
  });

  const currentRecordIndex = selectedRecord
    ? filteredRecords.findIndex(r => r.id === selectedRecord.id)
    : -1;

  const selectNextRecord = () => {
    if (filteredRecords.length === 0) return;
    const nextIdx = currentRecordIndex < filteredRecords.length - 1 ? currentRecordIndex + 1 : 0;
    selectRecord(filteredRecords[nextIdx]);
  };

  const selectPrevRecord = () => {
    if (filteredRecords.length === 0) return;
    const prevIdx = currentRecordIndex > 0 ? currentRecordIndex - 1 : filteredRecords.length - 1;
    selectRecord(filteredRecords[prevIdx]);
  };

  const handleRowCheck = (id: string, checked: boolean) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowIds(new Set(filteredRecords.map(r => r.id)));
    } else {
      setSelectedRowIds(new Set());
    }
  };

  const saveQuickEdit = async () => {
    if (!selectedRecord) return;
    const updates = {
      greenStampNumber: editStamp.trim(),
      customsRefNumber: editRef.trim(),
      consigneeName: editConsignee.trim().toUpperCase(),
      declarantName: editDeclarant.trim().toUpperCase(),
      status: 'CORRECTED' as const,
      manualCorrection: true
    };

    try {
      const res = await fetch(`/api/records/${selectedRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        await fetchRecords();
        showToast('Declaration saved successfully!', 'success', `#${editStamp} • ${editConsignee}`);
      }
    } catch (err: any) {
      showToast('Failed to save update', 'error', err.message);
    }
  };

  const saveQuickEditAndNext = async () => {
    await saveQuickEdit();
    selectNextRecord();
  };

  // -------------------------------------------------------------
  // BULK ACTIONS
  // -------------------------------------------------------------
  const deleteSelectedRecords = async () => {
    const ids = Array.from(selectedRowIds);
    if (ids.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${ids.length} selected declaration(s)?`)) return;

    try {
      const res = await fetch('/api/records/delete-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        setSelectedRowIds(new Set());
        fetchRecords();
        showToast(`Deleted ${ids.length} declaration(s)`, 'info');
      }
    } catch (err: any) {
      showToast('Bulk delete failed', 'error', err.message);
    }
  };

  const clearAllRecords = async () => {
    if (!confirm('Are you sure you want to clear all extracted declarations from the system?')) return;
    try {
      const res = await fetch('/api/records/clear', { method: 'POST' });
      if (res.ok) {
        setSelectedRecord(null);
        setSelectedRowIds(new Set());
        setRecords([]);
        await fetchRecords();
        await fetchStorageStats();
        showToast('System ledger cleared', 'info');
      }
    } catch (err: any) {
      showToast('Clear failed', 'error', err.message);
    }
  };

  const reprocessAllWithAI = async () => {
    if (!confirm('This will wipe current records and re-extract all uploaded images using Google Gemini Vision AI. Proceed?')) return;
    try {
      const res = await fetch('/api/records/reprocess-all', { method: 'POST' });
      if (res.ok) {
        setSelectedRowIds(new Set());
        fetchRecords();
        showToast('Re-processing all declarations with AI...', 'info');
      }
    } catch (err: any) {
      showToast('Reprocess error', 'error', err.message);
    }
  };

  const reprocessUnknownsWithAI = async () => {
    try {
      const res = await fetch('/api/records/reprocess-unknowns', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Queued ${data.count} items for re-extraction.`, 'success');
        setSelectedRowIds(new Set());
        fetchRecords();
      } else {
        showToast(data.error || data.message || 'Reprocess failed', 'error');
      }
    } catch (err: any) {
      showToast('Reprocess error', 'error', err.message);
    }
  };

  // -------------------------------------------------------------
  // UPLOADS & DRAG AND DROP (PARALLEL MULTI-THREADED WORKERS)
  // -------------------------------------------------------------
  const processFilesWithRealtimeProgress = async (files: File[]) => {
    if (!files || files.length === 0) return;

    isClientProcessingRef.current = true;
    isClientPausedRef.current = false;
    isClientCancelledRef.current = false;

    const totalCount = files.length;
    let completedCount = 0;
    let failedCount = 0;

    // Concurrency: use workerConcurrency setting (default 6)
    const concurrency = Math.min(totalCount, Math.max(1, settings.workerConcurrency || 6));
    const startTime = Date.now();

    setProcessingTelemetry({
      startTime,
      elapsedSeconds: 0,
      docsPerMinute: 0,
      etaSeconds: 0
    });

    // Initialize individual worker streams
    const initialWorkers: WorkerStreamState[] = Array.from({ length: concurrency }, (_, idx) => ({
      id: idx + 1,
      status: 'idle',
      step: 'Ready for batch...',
      progress: 0,
      completedInStream: 0
    }));
    setWorkerStreams(initialWorkers);

    // Immediately show real-time progress banner
    setQueueStatus({
      isProcessing: true,
      isPaused: false,
      pendingCount: totalCount,
      inFlightCount: concurrency,
      completedCount: 0,
      failedCount: 0,
      totalCount,
      progressPercent: 0
    });

    showToast(`Starting parallel extraction (${concurrency} streams) for ${totalCount} documents...`, 'info');

    let nextIndex = 0;

    const updateStream = (
      workerId: number,
      updater: Partial<WorkerStreamState> | ((prev: WorkerStreamState) => Partial<WorkerStreamState>)
    ) => {
      setWorkerStreams(prev =>
        prev.map(w => {
          if (w.id !== workerId) return w;
          const patch = typeof updater === 'function' ? updater(w) : updater;
          return { ...w, ...patch };
        })
      );
    };

    const runWorker = async (workerId: number) => {
      while (nextIndex < totalCount && !isClientCancelledRef.current) {
        // Pause loop
        while (isClientPausedRef.current && !isClientCancelledRef.current) {
          updateStream(workerId, { step: 'Paused' });
          await new Promise(res => setTimeout(res, 200));
        }

        if (isClientCancelledRef.current) {
          updateStream(workerId, { status: 'idle', step: 'Stream Cancelled' });
          break;
        }

        const currentIndex = nextIndex++;
        if (currentIndex >= totalCount) break;
        const currentFile = files[currentIndex];
        if (!currentFile) break;

        updateStream(workerId, {
          status: 'extracting',
          fileName: currentFile.name,
          step: 'Vision AI OCR Pass...',
          progress: 25
        });

        // Fast intermediate feedback
        const stepTimer = setTimeout(() => {
          updateStream(workerId, prev => {
            if (prev.status === 'extracting') {
              return { step: 'Extracting Boxes 8, 14 & Stamp...', progress: 65 };
            }
            return {};
          });
        }, 500);

        try {
          const formData = new FormData();
          formData.append('documents', currentFile);

          const res = await fetch('/api/upload?process=1', {
            method: 'POST',
            body: formData
          });

          clearTimeout(stepTimer);

          const text = await res.text();
          let data: any = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            throw new Error(`Server returned status ${res.status}`);
          }

          if (!res.ok) {
            throw new Error(data.error || `Upload failed with status ${res.status}`);
          }

          if (data.record) {
            // Instantly append newly extracted record in ledger state without collapsing duplicates!
            setRecords(prev => {
              const idx = prev.findIndex(r => r.id === data.record.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = data.record;
                return next;
              }
              return [data.record, ...prev];
            });
          }

          // Real-time smooth storage capacity update
          if (data.storageStats) {
            setStorageStats(data.storageStats);
          } else {
            setStorageStats(prev => {
              const addedBytes = currentFile.size || 250000;
              const nextTotalBytes = prev.totalBytes + addedBytes;
              const nextTotalFiles = prev.totalFiles + 1;
              const quotaBytes = 5 * 1024 * 1024 * 1024;
              const percentUsed = parseFloat(((nextTotalBytes / quotaBytes) * 100).toFixed(2));
              const formatK = (b: number) => {
                if (!b) return '0.00 B';
                const s = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(b) / Math.log(1024));
                return (b / Math.pow(1024, i)).toFixed(2) + ' ' + s[i];
              };
              return {
                ...prev,
                totalBytes: nextTotalBytes,
                totalFiles: nextTotalFiles,
                totalFormatted: formatK(nextTotalBytes),
                percentUsed,
                cloudFiles: prev.cloudFiles + 1,
                cloudBytes: prev.cloudBytes + addedBytes,
                cloudFormatted: formatK(prev.cloudBytes + addedBytes)
              };
            });
          }

          completedCount++;

          updateStream(workerId, prev => ({
            status: 'completed',
            step: `Verified #${data.record?.greenStampNumber || 'OK'} (${data.record?.confidence || 98}%)`,
            progress: 100,
            completedInStream: prev.completedInStream + 1,
            lastRecord: data.record ? {
              stampNo: data.record.greenStampNumber,
              customsRef: data.record.customsRefNumber,
              consignee: data.record.consigneeName,
              confidence: data.record.confidence,
              isDuplicate: data.record.isDuplicate
            } : undefined
          }));
        } catch (err: any) {
          clearTimeout(stepTimer);
          console.error(`Error processing ${currentFile.name}:`, err);
          failedCount++;
          updateStream(workerId, prev => ({
            status: 'error',
            step: `Error: ${err.message || 'Processing failed'}`,
            progress: 0,
            completedInStream: prev.completedInStream
          }));
        } finally {
          const totalDone = completedCount + failedCount;
          const progressPercent = Math.round((totalDone / totalCount) * 100);
          const elapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
          const dpm = Math.round((totalDone / elapsed) * 60);
          const remaining = Math.max(0, totalCount - totalDone);
          const eta = dpm > 0 ? Math.round((remaining / dpm) * 60) : 0;

          setProcessingTelemetry({
            startTime,
            elapsedSeconds: elapsed,
            docsPerMinute: dpm,
            etaSeconds: eta
          });

          setQueueStatus(prev => ({
            ...prev,
            pendingCount: Math.max(0, totalCount - totalDone),
            completedCount,
            failedCount,
            progressPercent
          }));
        }
      }

      updateStream(workerId, {
        status: 'idle',
        step: 'Standby / Complete',
        progress: 100
      });
    };

    const workers = Array.from({ length: concurrency }, (_, idx) => runWorker(idx + 1));
    await Promise.all(workers);

    isClientProcessingRef.current = false;

    if (isClientCancelledRef.current) {
      showToast(`Ingestion cancelled: ${completedCount} documents saved to ledger.`, 'warning');
    } else {
      showToast(`All ${completedCount} documents verified and saved to ledger!`, 'success');
    }

    setQueueStatus(prev => ({
      ...prev,
      isProcessing: false,
      progressPercent: 100
    }));

    await fetchRecords(false);
    await fetchStorageStats();
  };

  const handleZipFile = async (zipFile: File) => {
    try {
      showToast(`Unpacking ZIP: ${zipFile.name}...`, 'info');
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(zipFile);
      const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

      const imageFiles: File[] = [];
      const filenames = Object.keys(loadedZip.files);

      for (const filename of filenames) {
        const entry = loadedZip.files[filename];
        if (entry.dir) continue;
        const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
        if (validExts.includes(ext)) {
          const blob = await entry.async('blob');
          const cleanName = filename.split('/').pop() || filename;
          const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
          const file = new File([blob], cleanName, { type: mimeType });
          imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) {
        showToast('No valid images in ZIP', 'warning', 'ZIP must contain JPG, PNG, WEBP, or PDF files');
        return;
      }

      await processFilesWithRealtimeProgress(imageFiles);
    } catch (err: any) {
      showToast('ZIP Processing Failed', 'error', err.message);
    }
  };

  const handleFileUpload = async (files: FileList | null, endpoint: string, fieldName: string) => {
    if (!files || files.length === 0) return;

    if (fieldName === 'zipfile' || (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip'))) {
      await handleZipFile(files[0]);
      return;
    }

    if (fieldName === 'documents') {
      await processFilesWithRealtimeProgress(Array.from(files));
      return;
    }

    const formData = new FormData();
    formData.append(fieldName, files[0]);

    try {
      showToast(`Uploading ${files.length} file(s)...`, 'info');
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || `Server returned ${res.status} ${res.statusText}`);
      }

      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      showToast(`Upload complete!`, 'success');
      fetchRecords();
      fetchStorageStats();
    } catch (err: any) {
      showToast('Upload error', 'error', err.message);
    }
  };

  // Drag and Drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDraggingFile(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const isZip = files[0].name.toLowerCase().endsWith('.zip');
    if (isZip) {
      await handleZipFile(files[0]);
    } else {
      await handleFileUpload(files, '/api/upload', 'documents');
    }
  };

  // -------------------------------------------------------------
  // CANVAS ZOOM, PAN & ROTATION
  // -------------------------------------------------------------
  const adjustZoom = (delta: number) => {
    setZoomScale(prev => Math.max(0.4, Math.min(5.0, Number((prev + delta).toFixed(2)))));
  };

  const resetZoom = () => {
    setZoomScale(1.0);
    setRotation(0);
    setPanOffset({ x: 0, y: 0 });
  };

  const rotateImage = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label}`, 'success', text);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialPanRef.current = { ...panOffset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({
      x: initialPanRef.current.x + dx,
      y: initialPanRef.current.y + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    adjustZoom(delta);
  };

  // -------------------------------------------------------------
  // TALLY RECONCILIATION
  // -------------------------------------------------------------
  const runTallyMatching = async () => {
    if (tallySource === 'upload' && !tallyF1File) {
      return showToast('Select File 1', 'warning', 'Please select Generated Excel / CSV File 1.');
    }
    if (!tallyF2File) {
      return showToast('Select File 2', 'warning', 'Please select Master Reference File 2.');
    }

    const formData = new FormData();
    if (tallySource === 'upload' && tallyF1File) {
      formData.append('file1', tallyF1File);
    }
    formData.append('file2', tallyF2File);

    try {
      setIsTallyRunning(true);
      showToast('Reconciling declarations against master reference...', 'info');
      const res = await fetch('/api/tally/run', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tally failed');
      setTallyResult(data);
      showToast('Tally Complete!', 'success', `${data.matched?.length || 0} items matched both Consignee and Declarant.`);
    } catch (err: any) {
      showToast('Tally Error', 'error', err.message);
    } finally {
      setIsTallyRunning(false);
    }
  };

  // Render QR Code in modal
  useEffect(() => {
    if (isMobileModalOpen && qrCanvasRef.current && lanUrl) {
      QRCode.toCanvas(qrCanvasRef.current, lanUrl, { width: 220, margin: 2 }, err => {
        if (err) console.error(err);
      });
    }
  }, [isMobileModalOpen, lanUrl]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setIsSettingsModalOpen(false);
        showToast('Settings saved successfully!', 'success');
      }
    } catch (err: any) {
      showToast('Failed to save settings', 'error', err.message);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="min-h-screen flex flex-col bg-background text-foreground"
    >
      {/* ========================================================
           FLOATING TOAST NOTIFICATIONS (shadcn style)
           ======================================================== */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full border bg-popover/90 text-popover-foreground shadow-lg backdrop-blur-md text-sm font-medium animate-in fade-in-0 slide-in-from-top-4"
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            {t.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            {t.type === 'error' && <XCircle className="w-4 h-4 text-destructive" />}
            {t.type === 'info' && <Activity className="w-4 h-4 text-primary" />}
            <div className="flex flex-col">
              <span className="font-semibold">{t.message}</span>
              {t.subtext && <span className="text-xs text-muted-foreground">{t.subtext}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ========================================================
           FULL-SCREEN DRAG & DROP OVERLAY
           ======================================================== */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center gap-4 pointer-events-none animate-in fade-in-0">
          <div className="w-32 h-32 rounded-full border-4 border-dashed border-primary flex items-center justify-center animate-dropzone-spin bg-primary/10">
            <Upload className="w-12 h-12 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Drop Customs Documents to Ingest</h2>
          <p className="text-muted-foreground text-sm">Accepts JPG, PNG, WEBP, PDF & Bulk ZIP Archives</p>
        </div>
      )}

      {/* ========================================================
           ENTERPRISE HEADER: SHADCN APP BAR
           ======================================================== */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand & Terminal Info */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white border border-border/80 flex items-center justify-center p-1 shadow-sm overflow-hidden shrink-0">
              <img
                src="/logo.png"
                alt="Sri Lanka Customs Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight">LRSYS</span>
                <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase border-primary/30 text-primary">
                  CusDec v2.5
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Sri Lanka Customs • Port of Colombo</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Declarations vs Tally) */}
          <Tabs
            value={activeSection}
            onValueChange={(val: string) => setActiveSection(val as 'ocr' | 'tally')}
            className="w-auto"
          >
            <TabsList className="grid grid-cols-2 h-9 w-[300px]">
              <TabsTrigger value="ocr" className="gap-2">
                <FileText className="w-4 h-4" />
                <span>Declarations</span>
              </TabsTrigger>
              <TabsTrigger value="tally" className="gap-2">
                <ScanLine className="w-4 h-4" />
                <span>Tally Engine</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMobileModalOpen(true)}
              className="gap-1.5"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Mobile Scanner</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={reprocessUnknownsWithAI}
              className="gap-1.5"
              title="Reprocess records with unknown values using high-accuracy Vision AI"
            >
              <RotateCcw className="w-4 h-4 text-amber-500" />
              <span className="hidden md:inline">Fix Unknowns</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={reprocessAllWithAI}
              className="gap-1.5 text-destructive hover:text-destructive"
              title="Wipe and re-extract all documents"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden lg:inline">Reprocess All</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSettingsModalOpen(true)}
              className="gap-1.5"
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* ========================================================
           MAIN VIEWPORT CONTAINER
           ======================================================== */}
      <main className="max-w-[1760px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-6 flex-1">
        {/* ========================================================
             ACTIVE BATCH PROGRESS: APPLE iOS LIVE ACTIVITY / DYNAMIC ISLAND
             ======================================================== */}
        {queueStatus.isProcessing && (
          <div className="relative overflow-hidden rounded-3xl bg-zinc-950/90 dark:bg-black/90 backdrop-blur-2xl border border-zinc-800/80 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.08)] p-5 sm:p-6 transition-all duration-300">
            {/* Ambient iOS Background Glow */}
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col gap-5">
              {/* Top Dynamic Island Bar: Status, Stream Count, Speed & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-white/5">
                {/* Dynamic Island Capsule Pill */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-white/10 shadow-inner text-xs font-medium text-zinc-200">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="tracking-wide">AI Extraction Pipeline</span>
                  </div>

                  {/* Parallel Concurrency Badge */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{workerStreams.length || settings.workerConcurrency || 6} Parallel Streams</span>
                  </div>

                  {/* Speed & ETA Badges */}
                  {processingTelemetry.docsPerMinute > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>~{processingTelemetry.docsPerMinute} docs/min</span>
                    </div>
                  )}

                  {processingTelemetry.etaSeconds > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/80 border border-white/5 text-zinc-300 text-xs font-mono">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>ETA: {Math.floor(processingTelemetry.etaSeconds / 60)}m {processingTelemetry.etaSeconds % 60}s</span>
                    </div>
                  )}
                </div>

                {/* Tactile iOS Pill Action Buttons */}
                <div className="flex items-center gap-2">
                  {queueStatus.isPaused ? (
                    <button
                      onClick={() => {
                        if (isClientProcessingRef.current) {
                          isClientPausedRef.current = false;
                          setQueueStatus(prev => ({ ...prev, isPaused: false }));
                        } else {
                          fetch('/api/queue/resume', { method: 'POST' });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700/90 border border-white/10 text-xs font-semibold text-emerald-400 shadow-sm active:scale-95 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (isClientProcessingRef.current) {
                          isClientPausedRef.current = true;
                          setQueueStatus(prev => ({ ...prev, isPaused: true }));
                        } else {
                          fetch('/api/queue/pause', { method: 'POST' });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700/90 border border-white/10 text-xs font-semibold text-zinc-200 shadow-sm active:scale-95 transition-all"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (isClientProcessingRef.current) {
                        isClientCancelledRef.current = true;
                        setQueueStatus(prev => ({ ...prev, isProcessing: false }));
                        showToast('Batch processing cancelled.', 'warning');
                      } else {
                        fetch('/api/queue/cancel', { method: 'POST' });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 shadow-sm active:scale-95 transition-all"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>

              {/* Master Headline & Progress Track */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white flex items-center gap-2">
                      <span>Processing Customs Declarations</span>
                      {queueStatus.isPaused && (
                        <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">
                          PAUSED
                        </Badge>
                      )}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Ingesting {queueStatus.completedCount} of {queueStatus.totalCount} documents • {queueStatus.pendingCount} in queue
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono bg-gradient-to-r from-white via-cyan-100 to-emerald-200 bg-clip-text text-transparent">
                      {queueStatus.progressPercent}%
                    </span>
                  </div>
                </div>

                {/* iOS Capsule Progress Track with Shimmer */}
                <div className="relative h-3 w-full bg-zinc-900/90 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400 transition-all duration-300 ease-out shadow-[0_0_16px_rgba(56,189,248,0.45)] relative overflow-hidden"
                    style={{ width: `${Math.max(2, queueStatus.progressPercent)}%` }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-shimmer" />
                  </div>
                </div>
              </div>

              {/* Parallel Worker Streams Section */}
              {workerStreams.length > 0 && (
                <div className="flex flex-col gap-2.5 pt-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-400">
                      Active Parallel Worker Streams
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500">
                      Concurrency: {workerStreams.length}x Multi-Threaded
                    </span>
                  </div>

                  <div className={`grid grid-cols-1 ${
                    workerStreams.length === 1 ? 'sm:grid-cols-1' :
                    workerStreams.length === 2 ? 'sm:grid-cols-2' :
                    workerStreams.length === 3 ? 'sm:grid-cols-3' :
                    'sm:grid-cols-2 lg:grid-cols-4'
                  } gap-3`}>
                    {workerStreams.map(w => {
                      const isExtracting = w.status === 'extracting';
                      const isCompleted = w.status === 'completed';
                      const isError = w.status === 'error';

                      return (
                        <div
                          key={w.id}
                          className={`relative overflow-hidden rounded-2xl p-3.5 flex flex-col justify-between transition-all duration-300 backdrop-blur-md ${
                            isExtracting
                              ? 'bg-zinc-900/90 border border-cyan-500/40 shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]'
                              : isError
                              ? 'bg-zinc-900/70 border border-rose-500/40'
                              : isCompleted
                              ? 'bg-zinc-900/80 border border-emerald-500/30'
                              : 'bg-zinc-900/60 border border-zinc-800/80'
                          }`}
                        >
                          {/* Card Header: Stream tag & Completed badge */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5">
                              {isExtracting ? (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                                </span>
                              ) : isError ? (
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                              ) : isCompleted ? (
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-zinc-600" />
                              )}
                              <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-zinc-300">
                                STREAM {String(w.id).padStart(2, '0')}
                              </span>
                            </div>

                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-zinc-400">
                              {w.completedInStream} done
                            </span>
                          </div>

                          {/* Card Body: Active File Name */}
                          <div className="min-h-[44px] flex flex-col justify-center">
                            {w.fileName ? (
                              <div className="flex items-center gap-1.5" title={w.fileName}>
                                <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span className="font-mono text-xs text-zinc-100 truncate font-medium">
                                  {w.fileName}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                                <Check className="w-3.5 h-3.5" />
                                <span>Stream in standby</span>
                              </div>
                            )}

                            {/* Live Sub-step Indicator */}
                            <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-1 truncate">
                              {isExtracting ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
                                  <span className="truncate text-cyan-300/90">{w.step || 'Processing...'}</span>
                                </>
                              ) : (
                                <span className="truncate text-zinc-400">{w.step || 'Idle'}</span>
                              )}
                            </div>
                          </div>

                          {/* Micro Progress Bar */}
                          <div className="mt-2.5">
                            <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isExtracting
                                    ? 'bg-gradient-to-r from-cyan-500 to-sky-400'
                                    : isError
                                    ? 'bg-rose-500'
                                    : isCompleted
                                    ? 'bg-emerald-400'
                                    : 'bg-zinc-700'
                                }`}
                                style={{
                                  width: `${isExtracting ? (w.progress || 50) : isCompleted ? 100 : 0}%`
                                }}
                              />
                            </div>
                          </div>

                          {/* Last Result Micro-Pill */}
                          {w.lastRecord && (
                            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                              <span className="text-emerald-400 truncate">
                                #{w.lastRecord.stampNo || 'OK'}
                              </span>
                              <span className="text-zinc-500">
                                {w.lastRecord.confidence ? `${w.lastRecord.confidence}%` : 'Extracted'}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -----------------------------------------------------
             SECTION 1: DECLARATIONS & AUDIT LEDGER
             ----------------------------------------------------- */}
        {activeSection === 'ocr' && (
          <>
            {/* Command Deck Card: Actions & Ingestion */}
            <Card className="shadow-sm">
              <CardContent className="p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4">
                {/* Upload Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    ref={uploadInputRef}
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={e => handleFileUpload(e.target.files, '/api/upload', 'documents')}
                  />
                  <input
                    type="file"
                    ref={zipInputRef}
                    accept=".zip"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleZipFile(e.target.files[0]);
                        e.target.value = '';
                      }
                    }}
                  />

                  <Button
                    variant="default"
                    onClick={() => uploadInputRef.current?.click()}
                    className="gap-2 shadow-sm"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Ingest Documents</span>
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => zipInputRef.current?.click()}
                    className="gap-2"
                  >
                    <FolderArchive className="w-4 h-4" />
                    <span>Import ZIP</span>
                  </Button>
                </div>

                {/* Export & Ledger Utility Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href="/api/export/excel" download className="gap-1.5">
                      <Download className="w-4 h-4 text-emerald-500" />
                      <span>Export Excel</span>
                    </a>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href="/api/export/csv" download className="gap-1.5">
                      <Download className="w-4 h-4 text-sky-500" />
                      <span>Export CSV</span>
                    </a>
                  </Button>

                  {selectedRowIds.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={deleteSelectedRecords}
                      className="gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Selected ({selectedRowIds.size})</span>
                    </Button>
                  )}

                  {duplicateIdSet.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveDuplicates}
                      className="gap-1.5 border-amber-500/40 text-amber-500 dark:text-amber-400 hover:bg-amber-500/10 active:scale-95 transition-all shadow-sm"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Remove Duplicates ({duplicateIdSet.size})</span>
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllRecords}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Clear Ledger
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Telemetry Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Declarations
                  </CardTitle>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isInitialLoading ? (
                    <div>
                      <Skeleton className="h-8 w-16 rounded-md mb-1.5" />
                      <Skeleton className="h-3.5 w-28 rounded" />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold tracking-tight">{ledgerStats.total}</div>
                      <p className="text-xs text-muted-foreground mt-1">Ingested in port ledger</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-emerald-500/20 bg-emerald-500/[0.02]">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Verified Documents
                  </CardTitle>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  {isInitialLoading ? (
                    <div>
                      <Skeleton className="h-8 w-16 rounded-md mb-1.5" />
                      <Skeleton className="h-3.5 w-32 rounded" />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                        {ledgerStats.verified + ledgerStats.corrected}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Ready for port clearance</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-amber-500/20 bg-amber-500/[0.02]">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Needs Review
                  </CardTitle>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  {isInitialLoading ? (
                    <div>
                      <Skeleton className="h-8 w-12 rounded-md mb-1.5" />
                      <Skeleton className="h-3.5 w-36 rounded" />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                        {ledgerStats.needsReview}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Flagged for manual inspection</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-primary/20 bg-primary/[0.02]">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-primary">
                    Extraction Accuracy
                  </CardTitle>
                  <Activity className="w-4 h-4 text-primary" />
                </CardHeader>
                <CardContent>
                  {isInitialLoading ? (
                    <div>
                      <Skeleton className="h-8 w-20 rounded-md mb-1.5" />
                      <Skeleton className="h-3.5 w-32 rounded" />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold tracking-tight text-primary">
                        {ledgerStats.accuracyRate}%
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Multi-pass OCR confidence</p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* iOS-Style Interactive Storage Bucket Card */}
              <Card 
                onClick={() => { setIsStorageModalOpen(true); fetchStorageStats(true); }}
                className="shadow-sm border-sky-500/25 bg-gradient-to-br from-sky-500/[0.05] via-blue-500/[0.02] to-transparent cursor-pointer hover:border-sky-500/60 hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 select-none group relative overflow-hidden"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                    Storage Bucket
                    <span className="inline-block w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                  </CardTitle>
                  <HardDrive className="w-4 h-4 text-sky-500 group-hover:rotate-12 transition-transform duration-300" />
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  {isInitialLoading ? (
                    <div className="w-full flex items-center justify-between">
                      <div>
                        <Skeleton className="h-8 w-24 rounded-md mb-1.5" />
                        <Skeleton className="h-3.5 w-32 rounded" />
                      </div>
                      <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-sky-600 dark:text-sky-400">
                          {storageStats.totalFormatted}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {storageStats.totalFiles} files · {storageStats.percentUsed}% of 5GB
                        </p>
                      </div>
                      {/* Circular Activity Ring */}
                      <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
                        <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-sky-500/20"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="text-sky-500 transition-all duration-1000 ease-out"
                            strokeDasharray={`${Math.max(4, storageStats.percentUsed)}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <span className="absolute text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                          {Math.round(storageStats.percentUsed)}%
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Cargo Ledger Full-Width Table Card */}
            <Card className="shadow-sm">
              <CardHeader className="p-4 sm:p-6 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Status Filters */}
                  <Tabs
                    value={filter}
                    onValueChange={(val: string) => setFilter(val as any)}
                    className="w-auto"
                  >
                    <TabsList className="h-9">
                      <TabsTrigger value="ALL" className="gap-1.5 text-xs">
                        <span>All</span>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {records.length}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="NEEDS_REVIEW" className="gap-1.5 text-xs">
                        <span>Review</span>
                        {records.filter(r => r.status === 'NEEDS_REVIEW').length > 0 && (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            {records.filter(r => r.status === 'NEEDS_REVIEW').length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="VERIFIED" className="gap-1.5 text-xs">
                        <span>Verified</span>
                        <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                          {records.filter(r => r.status === 'VERIFIED').length}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="CORRECTED" className="gap-1.5 text-xs">
                        <span>Corrected</span>
                        <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                          {records.filter(r => r.status === 'CORRECTED').length}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="DUPLICATES" className="gap-1.5 text-xs">
                        <Copy className="w-3.5 h-3.5 text-amber-500" />
                        <span>Duplicates</span>
                        {duplicateIdSet.size > 0 && (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            {duplicateIdSet.size}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Search Bar with Shortcut Indicator */}
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search stamp, ref, consignee..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') fetchRecords(true, true);
                      }}
                      className="pl-9 pr-14 h-9 text-xs"
                    />
                    <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground bg-muted border rounded">
                      ⌘K
                    </kbd>
                  </div>
                </div>
              </CardHeader>

              <Separator />

              {/* Table Body */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredRecords.length > 0 && selectedRowIds.size === filteredRecords.length}
                          onChange={e => handleSelectAll(e.target.checked)}
                          className="rounded border-border cursor-pointer"
                        />
                      </TableHead>
                      <TableHead className="w-32">Stamp Duty No</TableHead>
                      <TableHead className="w-36">Customs Ref</TableHead>
                      <TableHead>Consignee (Box 8)</TableHead>
                      <TableHead>Declarant / Agent</TableHead>
                      <TableHead className="w-28 text-center">Status</TableHead>
                      <TableHead className="w-24 text-center">Confidence</TableHead>
                      <TableHead className="w-32">Date</TableHead>
                      <TableHead className="w-24 text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(isInitialLoading || isTableLoading) ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={`skeleton-row-${i}`} className="hover:bg-transparent animate-in fade-in duration-200">
                          <TableCell className="text-center py-4">
                            <Skeleton className="h-4 w-4 mx-auto rounded" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-6 w-20 rounded-full" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-24 rounded" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-44 rounded" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-36 rounded" />
                          </TableCell>
                          <TableCell className="text-center">
                            <Skeleton className="h-5 w-16 mx-auto rounded-full" />
                          </TableCell>
                          <TableCell className="text-center">
                            <Skeleton className="h-4 w-10 mx-auto rounded" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-20 rounded" />
                          </TableCell>
                          <TableCell className="text-center">
                            <Skeleton className="h-7 w-16 mx-auto rounded-lg" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="font-medium">No customs declarations found</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Upload document images or import a ZIP archive above.
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecords.map(r => {
                        const isSelected = selectedRowIds.has(r.id);
                        return (
                          <TableRow
                            key={r.id}
                            onClick={() => openInspectionModal(r)}
                            className="cursor-pointer hover:bg-muted/50 data-[state=selected]:bg-muted/70 transition-colors"
                          >
                            <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => handleRowCheck(r.id, e.target.checked)}
                                className="rounded border-border cursor-pointer"
                              />
                            </TableCell>

                            <TableCell className="font-mono font-semibold">
                              <Badge variant="success" className="font-mono text-xs">
                                {String(r.greenStampNumber || '—').padStart(6, '0')}
                              </Badge>
                            </TableCell>

                            <TableCell className="font-mono text-xs">
                              {r.customsRefNumber || '—'}
                            </TableCell>

                            <TableCell className="font-medium text-xs max-w-xs truncate">
                              {r.consigneeName || 'UNKNOWN'}
                            </TableCell>

                            <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                              {r.declarantName || 'UNKNOWN'}
                            </TableCell>

                            <TableCell className="text-center">
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {r.status === 'VERIFIED' && (
                                  <Badge variant="success" className="text-[11px] font-medium">
                                    Verified
                                  </Badge>
                                )}
                                {r.status === 'NEEDS_REVIEW' && (
                                  <Badge variant="warning" className="text-[11px] font-medium">
                                    Review
                                  </Badge>
                                )}
                                {r.status === 'CORRECTED' && (
                                  <Badge variant="info" className="text-[11px] font-medium">
                                    Corrected
                                  </Badge>
                                )}
                                {duplicateIdSet.has(r.id) && (
                                  <Badge variant="outline" className="text-[10px] font-medium bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 gap-1 px-1.5 py-0">
                                    <Copy className="w-2.5 h-2.5" />
                                    <span>Duplicate</span>
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="text-center font-mono text-xs">
                              <span className={r.confidence && r.confidence >= 90 ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                                {r.confidence ? `${r.confidence}%` : '—'}
                              </span>
                            </TableCell>

                            <TableCell className="text-xs text-muted-foreground">
                              {r.customsDate || r.createdAt || '—'}
                            </TableCell>

                            <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openInspectionModal(r)}
                                className="h-7 px-2.5 gap-1 text-xs"
                              >
                                <Eye className="w-3.5 h-3.5 text-primary" />
                                <span>Inspect</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}

        {/* -----------------------------------------------------
             SECTION 2: MARITIME TALLY ENGINE
             ----------------------------------------------------- */}
        {activeSection === 'tally' && (
          <div className="flex flex-col gap-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ScanLine className="w-5 h-5 text-primary" />
                  <span>CusDec Port Manifest Tally Engine</span>
                </CardTitle>
                <CardDescription>
                  Reconcile scanned Green Stamp duty declarations against master port manifest files to ensure 100% consignment delivery integrity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* File 1 Source */}
                  <Card className="border-dashed shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">File 1 (Source Declarations)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        <Button
                          variant={tallySource === 'db' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTallySource('db')}
                          className="flex-1 text-xs"
                        >
                          Use Extracted Database ({records.length})
                        </Button>
                        <Button
                          variant={tallySource === 'upload' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTallySource('upload')}
                          className="flex-1 text-xs"
                        >
                          Upload File 1
                        </Button>
                      </div>

                      {tallySource === 'upload' && (
                        <div>
                          <Input
                            type="file"
                            accept=".xlsx,.csv"
                            onChange={e => setTallyF1File(e.target.files?.[0] || null)}
                            className="text-xs"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* File 2 Source */}
                  <Card className="border-dashed shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">File 2 (Master Manifest Reference)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Select the official carrier master spreadsheet containing approved consignee & declarant manifests.
                      </p>
                      <Input
                        type="file"
                        accept=".xlsx,.csv"
                        onChange={e => setTallyF2File(e.target.files?.[0] || null)}
                        className="text-xs"
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="emerald"
                    disabled={isTallyRunning}
                    onClick={runTallyMatching}
                    className="gap-2"
                  >
                    <Activity className={`w-4 h-4 ${isTallyRunning ? 'animate-spin' : ''}`} />
                    <span>{isTallyRunning ? 'Reconciling...' : 'Run Tally Reconciliation'}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tally Running Skeleton State */}
            {isTallyRunning && (
              <Card className="shadow-sm border-primary/30 animate-in fade-in duration-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <Skeleton className="h-5 w-52 rounded mb-1.5" />
                      <Skeleton className="h-3.5 w-72 rounded" />
                    </div>
                    <Skeleton className="h-6 w-28 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-3 p-3 bg-muted/40 rounded-xl">
                    <Skeleton className="h-4 rounded" />
                    <Skeleton className="h-4 rounded" />
                    <Skeleton className="h-4 rounded" />
                    <Skeleton className="h-4 rounded" />
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`tally-skel-${i}`} className="grid grid-cols-4 gap-3 p-3 border-b border-border/30">
                      <Skeleton className="h-4 rounded" />
                      <Skeleton className="h-4 rounded" />
                      <Skeleton className="h-4 rounded" />
                      <Skeleton className="h-4 rounded" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Tally Results View */}
            {tallyResult && (
              <Card className="shadow-sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-base font-semibold">Tally Reconciliation Results</CardTitle>
                      <CardDescription className="text-xs">
                        Audit completion timestamp: {new Date().toLocaleTimeString()}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href="/api/tally/export/excel" download className="gap-1.5 text-xs">
                          <Download className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Export Tally Excel</span>
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/api/tally/export/csv" download className="gap-1.5 text-xs">
                          <Download className="w-3.5 h-3.5 text-sky-500" />
                          <span>Export Tally CSV</span>
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Tabs
                      value={tallyFilter}
                      onValueChange={(val: string) => setTallyFilter(val as any)}
                    >
                      <TabsList className="h-9">
                        <TabsTrigger value="MATCHED" className="gap-1.5 text-xs">
                          <span>Matched</span>
                          <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                            {tallyResult.matched?.length || 0}
                          </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="UNMATCHED_F1" className="gap-1.5 text-xs">
                          <span>Unmatched in F1</span>
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            {tallyResult.unmatchedFile1?.length || 0}
                          </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="UNMATCHED_F2" className="gap-1.5 text-xs">
                          <span>Missing from Manifest (F2)</span>
                          <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                            {tallyResult.unmatchedFile2?.length || 0}
                          </Badge>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stamp Duty No</TableHead>
                        <TableHead>Customs Ref</TableHead>
                        <TableHead>Consignee Name</TableHead>
                        <TableHead>Declarant Name</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tallyFilter === 'MATCHED' && tallyResult.matched.map((m, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono font-semibold">
                            <Badge variant="success" className="font-mono text-xs">
                              {m.counterStamp || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{m.customsRef || '—'}</TableCell>
                          <TableCell className="font-medium text-xs">{m.consigneeName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.declarantName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="success" className="text-[10px]">MATCHED</Badge>
                          </TableCell>
                        </TableRow>
                      ))}

                      {tallyFilter === 'UNMATCHED_F1' && tallyResult.unmatchedFile1.map((u, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono font-semibold">
                            <Badge variant="warning" className="font-mono text-xs">
                              {u.counterStamp || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{u.customsRef || '—'}</TableCell>
                          <TableCell className="font-medium text-xs">{u.consigneeName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{u.declarantName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="warning" className="text-[10px]">UNMATCHED F1</Badge>
                          </TableCell>
                        </TableRow>
                      ))}

                      {tallyFilter === 'UNMATCHED_F2' && tallyResult.unmatchedFile2.map((u, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs text-muted-foreground">—</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">—</TableCell>
                          <TableCell className="font-medium text-xs">{u.consigneeName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{u.declarantName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive" className="text-[10px]">MISSING IN F2</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* ========================================================
           ENTERPRISE TERMINAL FOOTER & CREDITS
           ======================================================== */}
      <footer className="w-full border-t border-border/40 bg-background/95 mt-auto">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            © 2026 LRSYS - Sri Lanka Customs (CusDec) Maritime Cargo Terminal. All Rights Reserved.
          </div>
          <a
            href="https://vehan.netlify.app"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <span>dev by</span>
            <span className="font-semibold text-foreground group-hover:text-primary transition-colors inline-flex items-center gap-0.5 underline-offset-4 group-hover:underline">
              Vehan Rajintha
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
            </span>
          </a>
        </div>
      </footer>

      {/* ========================================================
           VISIONOS / SHADCN ENTERPRISE INSPECTION MODAL DIALOG
           ======================================================== */}
      <Dialog open={isInspectionModalOpen} onOpenChange={setIsInspectionModalOpen}>
        <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Dialog Header */}
          <div className="p-4 sm:p-5 border-b flex items-center justify-between gap-3 bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Declaration Inspection & Audit Bay
                </DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  {selectedRecord?.originalName || selectedRecord?.filename || 'Document Viewport'} • Record {currentRecordIndex + 1} of {filteredRecords.length}
                </DialogDescription>
              </div>
            </div>

            {selectedRecord && (
              <Badge
                variant={selectedRecord.status === 'VERIFIED' ? 'success' : selectedRecord.status === 'CORRECTED' ? 'info' : 'warning'}
                className="text-xs font-semibold uppercase tracking-wider"
              >
                {selectedRecord.status}
              </Badge>
            )}
          </div>

          {/* Dialog Body (Canvas Viewport + Quick Edit Pod) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto flex-1">
            {/* Left Column: High-Res Interactive Canvas */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              {/* Canvas Controls */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Optical Document Canvas
                </span>

                <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
                  <Button variant="ghost" size="icon" onClick={() => adjustZoom(0.25)} className="h-7 w-7" title="Zoom in">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => adjustZoom(-0.25)} className="h-7 w-7" title="Zoom out">
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={rotateImage} className="h-7 w-7" title="Rotate 90°">
                    <RotateCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetZoom} className="h-7 px-2 text-xs">
                    Reset
                  </Button>
                  <span className="text-[11px] font-mono font-medium px-2 text-muted-foreground">
                    {Math.round(zoomScale * 100)}%
                  </span>
                </div>
              </div>

              {/* Viewport Stage */}
              <div
                className={`w-full h-[460px] bg-black rounded-xl border relative flex items-center justify-center overflow-hidden viewport-canvas ${isDragging ? 'grabbing' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              >
                {/* Optical Scanning Skeleton Loader */}
                {isImageLoading && selectedRecord?.filename && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in duration-200">
                    <div className="relative w-52 h-72 sm:w-64 sm:h-80 border-2 border-dashed border-sky-500/40 rounded-2xl bg-zinc-950/80 p-4 flex flex-col justify-between overflow-hidden shadow-2xl">
                      {/* Animated Laser Scanning Line */}
                      <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#38bdf8] animate-scan-laser pointer-events-none" />

                      {/* Header skeleton */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Skeleton className="h-4 w-24 rounded" />
                          <Skeleton className="h-6 w-16 rounded-full bg-emerald-500/20" />
                        </div>
                        <Skeleton className="h-3 w-36 rounded" />
                      </div>

                      {/* Middle layout skeleton */}
                      <div className="space-y-2.5 my-auto">
                        <div className="grid grid-cols-2 gap-2">
                          <Skeleton className="h-10 rounded-lg bg-zinc-900/90 border border-zinc-800" />
                          <Skeleton className="h-10 rounded-lg bg-zinc-900/90 border border-zinc-800" />
                        </div>
                        <Skeleton className="h-3 w-full rounded" />
                        <Skeleton className="h-3 w-5/6 rounded" />
                        <Skeleton className="h-3 w-4/6 rounded" />
                      </div>

                      {/* Footer skeleton */}
                      <div className="pt-2 border-t border-border/40 flex justify-between items-center">
                        <Skeleton className="h-3 w-20 rounded" />
                        <Skeleton className="h-3 w-14 rounded" />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-xs font-mono text-cyan-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      <span className="tracking-wider">STREAMING HIGH-RES CUSDEC SCAN...</span>
                    </div>
                  </div>
                )}

                {selectedRecord?.filename ? (
                  <img
                    src={selectedRecord.imageUrl || `/api/images/${encodeURIComponent(selectedRecord.filename)}`}
                    alt="Customs Declaration Document"
                    draggable={false}
                    onLoad={() => setIsImageLoading(false)}
                    onError={() => setIsImageLoading(false)}
                    className={`max-w-full max-h-full object-contain pointer-events-none select-none transition-opacity duration-300 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale}) rotate(${rotation}deg)`,
                      transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                    }}
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No preview document available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Quick Edit Form */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <Card className="shadow-none border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Quick Audit & Verification</span>
                    <Badge variant="outline" className="text-[11px] font-mono">
                      CusDec Form
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Review and verify OCR values extracted from Box 40, Box 14, and Box 8.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stamp Duty No */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="stamp" className="text-xs font-semibold text-muted-foreground uppercase">
                        Stamp Duty Number (Box 40)
                      </Label>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(editStamp, 'Stamp Number')}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <Input
                      id="stamp"
                      value={editStamp}
                      onChange={e => setEditStamp(e.target.value)}
                      className="font-mono text-sm font-semibold"
                      placeholder="000073"
                    />
                  </div>

                  {/* Customs Ref */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ref" className="text-xs font-semibold text-muted-foreground uppercase">
                        Customs Reference (Box 14)
                      </Label>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(editRef, 'Customs Ref')}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <Input
                      id="ref"
                      value={editRef}
                      onChange={e => setEditRef(e.target.value)}
                      className="font-mono text-sm"
                      placeholder="CUSTOMS-REF-NUMBER"
                    />
                  </div>

                  {/* Consignee */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="consignee" className="text-xs font-semibold text-muted-foreground uppercase">
                        Consignee Name (Box 8)
                      </Label>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(editConsignee, 'Consignee')}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <Input
                      id="consignee"
                      value={editConsignee}
                      onChange={e => setEditConsignee(e.target.value)}
                      className="text-sm font-medium uppercase"
                      placeholder="CONSIGNEE NAME"
                    />
                  </div>

                  {/* Declarant */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="declarant" className="text-xs font-semibold text-muted-foreground uppercase">
                        Declarant / Agent (Box 14)
                      </Label>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(editDeclarant, 'Declarant')}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <Input
                      id="declarant"
                      value={editDeclarant}
                      onChange={e => setEditDeclarant(e.target.value)}
                      className="text-sm uppercase"
                      placeholder="DECLARANT NAME"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-2 pt-0">
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <Button
                      variant="emerald"
                      onClick={saveQuickEdit}
                      className="w-full gap-1.5 text-xs"
                    >
                      <Check className="w-4 h-4" /> Save Record
                    </Button>
                    <Button
                      variant="default"
                      onClick={saveQuickEditAndNext}
                      className="w-full gap-1.5 text-xs"
                    >
                      <span>Save & Next</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between w-full pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectPrevRecord}
                      className="text-xs"
                    >
                      ← Previous
                    </Button>
                    <span className="text-xs text-muted-foreground font-mono">
                      {currentRecordIndex + 1} / {filteredRecords.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectNextRecord}
                      className="text-xs"
                    >
                      Next →
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================
           iOS-STYLE SYSTEM SETTINGS ACTION SHEET MODAL
           ======================================================== */}
      {isSettingsModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsSettingsModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg bg-card/95 border border-border/70 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* iOS Pull Indicator Pill */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="px-6 pt-2 pb-4 text-center border-b border-border/40">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-2.5 shadow-sm">
                <Sliders className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">System & AI Configuration</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure Google Gemini Vision AI parameters and cloud ingestion
              </p>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveSettings} className="p-6 space-y-4 overflow-y-auto">
              {/* Group 1: Gemini Vision AI Keys */}
              <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 space-y-3.5">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Gemini Vision Credentials</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-border/60 text-muted-foreground">
                    Multi-Pass Engine
                  </Badge>
                </div>

                {/* Primary API Key (Protected System Key) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span>Primary API Key</span>
                    </Label>
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
                      Pre-configured System Key
                    </span>
                  </div>
                  <Input
                    type="password"
                    readOnly
                    disabled
                    value="AIzaSy••••••••••••••••••••••••••••••••••••"
                    className="text-xs font-mono rounded-xl bg-background/50 border-border/40 text-muted-foreground/80 cursor-not-allowed select-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Active key used for instant multi-pass vision extraction (configured in environment).
                  </p>
                </div>

                {/* Backup API Key (Protected Auto-Failover Key) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span>Backup API Key (Auto-Failover)</span>
                    </Label>
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
                      Pre-configured System Key
                    </span>
                  </div>
                  <Input
                    type="password"
                    readOnly
                    disabled
                    value="AQ.Ab8RN6••••••••••••••••••••••••••••••••••••"
                    className="text-xs font-mono rounded-xl bg-background/50 border-border/40 text-muted-foreground/80 cursor-not-allowed select-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Engages automatically with zero sleep when the primary hits daily 429 quota.
                  </p>
                </div>

                {/* Custom API Key Override Section */}
                <div className="pt-3 border-t border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="useCustomApiKey" className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        id="useCustomApiKey"
                        type="checkbox"
                        checked={Boolean(settings.useCustomApiKey)}
                        onChange={e => setSettings({ ...settings, useCustomApiKey: e.target.checked })}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-foreground">
                        Use Custom API Key Override
                      </span>
                    </label>
                    {settings.useCustomApiKey ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] py-0.5 px-2">
                        Custom Key Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] py-0.5 px-2 text-muted-foreground border-border/60">
                        System Keys Active
                      </Badge>
                    )}
                  </div>

                  <Input
                    id="customApiKey"
                    type="password"
                    placeholder="Enter custom Gemini API key (AIzaSy...)"
                    value={settings.customApiKey || ''}
                    onChange={e => setSettings({ ...settings, customApiKey: e.target.value })}
                    disabled={!settings.useCustomApiKey}
                    className={`text-xs font-mono rounded-xl bg-background border-border/60 transition-all ${
                      settings.useCustomApiKey
                        ? 'border-emerald-500/60 shadow-sm focus:border-emerald-500'
                        : 'opacity-40 cursor-not-allowed'
                    }`}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {settings.useCustomApiKey ? (
                      <span className="text-emerald-400 font-medium">
                        ⚡ Override active: The system will use exactly this custom key instead of the pre-configured system keys.
                      </span>
                    ) : (
                      <span>
                        Tick the box to use your own Gemini API key. When unticked, the system uses the pre-configured keys above.
                      </span>
                    )}
                  </p>
                </div>

                {/* Gemini Vision Model */}
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label htmlFor="model" className="text-xs font-medium text-foreground">
                    Gemini Vision Model
                  </Label>
                  <Input
                    id="model"
                    value={settings.geminiModel || 'gemini-3.5-flash-lite'}
                    onChange={e => setSettings({ ...settings, geminiModel: e.target.value })}
                    className="text-xs font-mono rounded-xl bg-background border-border/60"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSettings({ ...settings, geminiModel: m })}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-mono transition-all ${
                          settings.geminiModel === m
                            ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                            : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Group 2: Automation & Performance */}
              <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 space-y-3">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Pipeline Automation</span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="threshold" className="text-xs font-medium text-foreground">
                      Auto-Verification Confidence
                    </Label>
                    <span className="text-xs font-bold text-emerald-500 font-mono">
                      {settings.autoVerifyThreshold}%
                    </span>
                  </div>
                  <Input
                    id="threshold"
                    type="number"
                    min="50"
                    max="100"
                    value={settings.autoVerifyThreshold}
                    onChange={e => setSettings({ ...settings, autoVerifyThreshold: Number(e.target.value) })}
                    className="text-xs rounded-xl bg-background border-border/60"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Declarations scored above this threshold are automatically marked Verified.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="concurrency" className="text-xs font-medium text-foreground">
                      Parallel Workers
                    </Label>
                    <span className="text-xs font-bold text-primary font-mono">
                      {settings.workerConcurrency} concurrent
                    </span>
                  </div>
                  <Input
                    id="concurrency"
                    type="number"
                    min="1"
                    max="12"
                    value={settings.workerConcurrency}
                    onChange={e => setSettings({ ...settings, workerConcurrency: Number(e.target.value) })}
                    className="text-xs rounded-xl bg-background border-border/60"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Number of declarations processed simultaneously in parallel.
                  </p>
                </div>
              </div>

              {/* iOS Action Buttons */}
              <div className="pt-2 space-y-2">
                <Button 
                  type="submit" 
                  className="w-full py-3 rounded-2xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md"
                >
                  Save Settings
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full py-2.5 rounded-2xl font-semibold border-border/60 hover:bg-muted active:scale-[0.98] transition-all"
                  onClick={() => setIsSettingsModalOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
           iOS-STYLE MOBILE SCANNER QR CODE ACTION SHEET MODAL
           ======================================================== */}
      {isMobileModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsMobileModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm bg-card/95 border border-border/70 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 p-6 text-center"
            onClick={e => e.stopPropagation()}
          >
            {/* iOS Pull Indicator Pill */}
            <div className="pb-3 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-2.5 shadow-sm">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-foreground tracking-tight">Mobile Port Scanner</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Scan with your phone camera on this Wi-Fi network to capture and upload CusDec photos instantly
            </p>

            <div className="my-5 flex flex-col items-center gap-3">
              <div className="p-3.5 bg-white rounded-2xl shadow-md border">
                <canvas ref={qrCanvasRef} />
              </div>

              <a
                href={lanUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono font-semibold text-primary hover:underline flex items-center gap-1.5 bg-primary/10 px-3.5 py-1.5 rounded-full border border-primary/20 active:scale-95 transition-all"
              >
                <span>{lanUrl}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full py-2.5 rounded-2xl font-semibold border-border/60 hover:bg-muted active:scale-[0.98] transition-all"
              onClick={() => setIsMobileModalOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================
           iOS-STYLE STORAGE MANAGEMENT ACTION SHEET MODAL
           ======================================================== */}
      {isStorageModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            if (!isPurgingStorage) {
              setConfirmPurgeAction(null);
              setIsStorageModalOpen(false);
            }
          }}
        >
          <div 
            className="w-full max-w-md bg-card/95 border border-border/70 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* iOS Pull Indicator Pill */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="p-6 pt-2 text-center">
              {isStorageLoading ? (
                <div className="space-y-4 my-4 animate-in fade-in duration-200">
                  <Skeleton className="w-24 h-24 rounded-full mx-auto" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-6 w-48 rounded mx-auto" />
                    <Skeleton className="h-3.5 w-60 rounded mx-auto" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-left">
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                  </div>
                </div>
              ) : (
                <>
                  {/* Circular Storage Visualizer */}
                  <div className="relative w-28 h-28 mx-auto my-3 flex items-center justify-center">
                    <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-sky-500/15"
                        strokeWidth="3"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-sky-500 transition-all duration-1000 ease-out"
                        strokeDasharray={`${Math.max(5, storageStats.percentUsed)}, 100`}
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <HardDrive className="w-5 h-5 text-sky-500 mb-0.5" />
                      <span className="text-base font-bold text-foreground">
                        {storageStats.percentUsed}%
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Capacity
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-foreground tracking-tight">
                    {storageStats.totalFormatted} of {storageStats.quotaFormatted} Used
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {storageStats.totalFiles} documents stored in {storageStats.provider === 'supabase' ? 'Supabase Bucket' : storageStats.provider === 'hybrid' ? 'Supabase + Local Cache' : 'Local Storage'}
                  </p>

                  {/* Breakdown Pills */}
                  <div className="grid grid-cols-2 gap-2 mt-4 text-left">
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                      <div className="text-[11px] text-muted-foreground font-medium">Cloud Storage</div>
                      <div className="text-sm font-semibold text-foreground mt-0.5">
                        {storageStats.cloudFormatted}
                      </div>
                      <div className="text-[10px] text-sky-500">{storageStats.cloudFiles} remote files</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                      <div className="text-[11px] text-muted-foreground font-medium">Local Cache</div>
                      <div className="text-sm font-semibold text-foreground mt-0.5">
                        {storageStats.localFormatted}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{storageStats.localFiles} cached files</div>
                    </div>
                  </div>
                </>
              )}

              {/* iOS Action Menu List */}
              <div className="mt-5 space-y-2 text-left">
                {confirmPurgeAction ? (
                  <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-destructive">
                          {confirmPurgeAction === 'all' ? 'Purge Entire Storage Bucket?' : 'Clean Unlinked Orphan Images?'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {confirmPurgeAction === 'all'
                            ? 'This permanently deletes all declaration images from your Supabase bucket and local uploads. Declaration ledger metadata will remain.'
                            : 'This permanently deletes images that do not match any active record in the cargo ledger.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 rounded-xl text-xs font-semibold"
                        disabled={isPurgingStorage}
                        onClick={() => handlePurgeStorage(confirmPurgeAction)}
                      >
                        {isPurgingStorage ? 'Deleting...' : 'Yes, Delete Files'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl text-xs"
                        disabled={isPurgingStorage}
                        onClick={() => setConfirmPurgeAction(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmPurgeAction('orphans')}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-muted/30 hover:bg-muted/60 active:scale-[0.98] transition-all border border-border/40 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">Clean Orphan Images</div>
                          <div className="text-[11px] text-muted-foreground">Free space by deleting unlinked scans</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmPurgeAction('all')}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-destructive/[0.04] hover:bg-destructive/10 active:scale-[0.98] transition-all border border-destructive/20 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive group-hover:scale-110 transition-transform">
                          <Trash2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-destructive">Purge All Storage Bucket Files</div>
                          <div className="text-[11px] text-muted-foreground">Wipe all images from Supabase & disk</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-destructive group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        fetchStorageStats();
                        showToast('Storage refreshed', 'info');
                      }}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-muted/30 hover:bg-muted/60 active:scale-[0.98] transition-all border border-border/40 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 group-hover:scale-110 transition-transform">
                          <RefreshCw className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">Refresh Telemetry</div>
                          <div className="text-[11px] text-muted-foreground">Recalculate bucket bytes and quota</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </>
                )}
              </div>

              {/* iOS Dismiss Button */}
              <div className="mt-4 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full py-2.5 rounded-2xl font-semibold border-border/60 hover:bg-muted active:scale-[0.98] transition-all"
                  onClick={() => {
                    setConfirmPurgeAction(null);
                    setIsStorageModalOpen(false);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
