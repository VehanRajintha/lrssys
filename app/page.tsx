'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { CusDecRecord, Settings, QueueStatus, Stats, TallyResult, TallyRecord } from '@/lib/types';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
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
  HardDrive
} from 'lucide-react';

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
  const [stats, setStats] = useState<Stats>({
    total: 0,
    verified: 0,
    needsReview: 0,
    corrected: 0,
    accuracyRate: 100
  });
  const [filter, setFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'VERIFIED' | 'CORRECTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Quick edit form state
  const [editStamp, setEditStamp] = useState('');
  const [editRef, setEditRef] = useState('');
  const [editConsignee, setEditConsignee] = useState('');
  const [editDeclarant, setEditDeclarant] = useState('');

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
    geminiModel: 'gemini-3.5-flash-lite',
    autoVerifyThreshold: 90,
    workerConcurrency: 4,
    consignorConsigneeMode: 'both',
    preserveLeadingZeros: true
  });

  // Hidden inputs refs
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

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

    // Start queue telemetry polling
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/queue/status');
        if (res.ok) {
          const data = await res.json();
          setQueueStatus(data.queue);
          if (data.stats) setStats(data.stats);
          if (data.queue.isProcessing) {
            fetchRecords(false);
          }
        }
      } catch (err) {}
    }, 1500);

    return () => clearInterval(interval);
  }, []);

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
  const fetchRecords = async (updateSelection = true) => {
    try {
      const q = searchTerm.trim();
      const url = `/api/records?status=ALL${q ? `&search=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        if (data.stats) setStats(data.stats);

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

  const fetchStorageStats = async () => {
    try {
      const res = await fetch('/api/storage/stats');
      if (res.ok) {
        const data = await res.json();
        setStorageStats(data);
      }
    } catch (err) {}
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
    selectRecord(record);
    setIsInspectionModalOpen(true);
  };

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
      await fetch('/api/records/clear', { method: 'POST' });
      setSelectedRecord(null);
      setSelectedRowIds(new Set());
      fetchRecords();
      showToast('System ledger cleared', 'info');
    } catch (err) {}
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
  // UPLOADS & DRAG AND DROP
  // -------------------------------------------------------------
  const handleFileUpload = async (files: FileList | null, endpoint: string, fieldName: string) => {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    if (fieldName === 'documents') {
      for (let i = 0; i < files.length; i++) {
        formData.append('documents', files[i]);
      }
    } else {
      formData.append(fieldName, files[0]);
    }

    try {
      showToast(`Uploading ${files.length} file(s)...`, 'info');
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      showToast(`Upload complete! Processing in queue.`, 'success');
      fetchRecords();
    } catch (err: any) {
      showToast('Upload error', 'error', err.message);
    }
  };

  const loadDemoSample = async () => {
    try {
      showToast('Loading official sample 000073...', 'info');
      const res = await fetch('/api/demo/load-sample', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTimeout(fetchRecords, 500);
      showToast('Demo Sample 000073 loaded successfully!', 'success');
    } catch (err: any) {
      showToast('Failed to load demo', 'error', err.message);
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
      await handleFileUpload(files, '/api/upload-zip', 'zipfile');
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
        {/* Active Batch Progress Banner */}
        {queueStatus.isProcessing && (
          <Card className="border-primary/30 bg-primary/5 shadow-sm">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary animate-spin" />
                  <span className="font-semibold text-sm">Processing Customs Documents...</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {queueStatus.completedCount} / {queueStatus.totalCount} ({queueStatus.progressPercent}%)
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {queueStatus.isPaused ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetch('/api/queue/resume', { method: 'POST' })}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Play className="w-3.5 h-3.5" /> Resume
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetch('/api/queue/pause', { method: 'POST' })}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Pause className="w-3.5 h-3.5" /> Pause
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => fetch('/api/queue/cancel', { method: 'POST' })}
                    className="gap-1.5 h-7 text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </div>
              </div>
              <Progress value={queueStatus.progressPercent} className="h-2" />
            </CardContent>
          </Card>
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
                    onChange={e => handleFileUpload(e.target.files, '/api/upload-zip', 'zipfile')}
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

                  <Button
                    variant="outline"
                    onClick={loadDemoSample}
                    className="gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span>Load Demo 000073</span>
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
                  <div className="text-3xl font-bold tracking-tight">{stats.total}</div>
                  <p className="text-xs text-muted-foreground mt-1">Ingested in port ledger</p>
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
                  <div className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {stats.verified + stats.corrected}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Ready for port clearance</p>
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
                  <div className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                    {stats.needsReview}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Flagged for manual inspection</p>
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
                  <div className="text-3xl font-bold tracking-tight text-primary">
                    {stats.accuracyRate}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Multi-pass OCR confidence</p>
                </CardContent>
              </Card>

              {/* iOS-Style Interactive Storage Bucket Card */}
              <Card 
                onClick={() => setIsStorageModalOpen(true)}
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
                        {stats.needsReview > 0 && (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            {stats.needsReview}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="VERIFIED" className="gap-1.5 text-xs">
                        <span>Verified</span>
                        <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                          {stats.verified}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="CORRECTED" className="gap-1.5 text-xs">
                        <span>Corrected</span>
                        <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                          {stats.corrected}
                        </Badge>
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
                        if (e.key === 'Enter') fetchRecords();
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
                    {filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="font-medium">No customs declarations found</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Upload document images or click "Load Demo 000073" above.
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
                className={`w-full h-[460px] bg-slate-950 rounded-xl border relative flex items-center justify-center overflow-hidden viewport-canvas ${isDragging ? 'grabbing' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              >
                {selectedRecord?.filename ? (
                  <img
                    src={selectedRecord.imageUrl || `/api/images/${encodeURIComponent(selectedRecord.filename)}`}
                    alt="Customs Declaration Document"
                    draggable={false}
                    className="max-w-full max-h-full object-contain pointer-events-none select-none"
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
           SYSTEM SETTINGS MODAL DIALOG
           ======================================================== */}
      <Dialog open={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              <span>System & AI Configuration</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure Google Gemini Vision AI parameters and terminal ingestion settings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSettings} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="apiKey" className="text-xs font-semibold">Gemini API Key (Primary)</Label>
              <Input
                id="apiKey"
                type="password"
                value={settings.geminiApiKey || ''}
                onChange={e => setSettings({ ...settings, geminiApiKey: e.target.value })}
                placeholder="AIzaSy..."
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Primary API key for extraction and verification.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="backupApiKey" className="text-xs font-semibold">Backup Gemini API Key (Auto-Failover)</Label>
              <Input
                id="backupApiKey"
                type="password"
                value={settings.geminiBackupApiKey || ''}
                onChange={e => setSettings({ ...settings, geminiBackupApiKey: e.target.value })}
                placeholder="AQ.Ab8RN6..."
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Engages seamlessly if the primary API key reaches its daily quota limit.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model" className="text-xs font-semibold">Gemini Model</Label>
              <Input
                id="model"
                value={settings.geminiModel || 'gemini-3.5-flash-lite'}
                onChange={e => setSettings({ ...settings, geminiModel: e.target.value })}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="threshold" className="text-xs font-semibold">
                Auto-Verification Threshold ({settings.autoVerifyThreshold}%)
              </Label>
              <Input
                id="threshold"
                type="number"
                min="50"
                max="100"
                value={settings.autoVerifyThreshold}
                onChange={e => setSettings({ ...settings, autoVerifyThreshold: Number(e.target.value) })}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Documents with confidence above this score are automatically marked Verified.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="concurrency" className="text-xs font-semibold">
                Parallel OCR Workers ({settings.workerConcurrency})
              </Label>
              <Input
                id="concurrency"
                type="number"
                min="1"
                max="8"
                value={settings.workerConcurrency}
                onChange={e => setSettings({ ...settings, workerConcurrency: Number(e.target.value) })}
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsSettingsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default">
                Save Settings
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================
           MOBILE SCANNER QR CODE MODAL DIALOG
           ======================================================== */}
      <Dialog open={isMobileModalOpen} onOpenChange={setIsMobileModalOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              <span>Mobile Port Scanner</span>
            </DialogTitle>
            <DialogDescription className="text-center text-xs">
              Scan with any mobile camera on the same Wi-Fi to snap and upload CusDec photos instantly.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-4">
            <div className="p-3 bg-white rounded-xl shadow-sm border">
              <canvas ref={qrCanvasRef} />
            </div>

            <a
              href={lanUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono font-medium text-primary hover:underline flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 rounded-full"
            >
              <span>{lanUrl}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={() => setIsMobileModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
