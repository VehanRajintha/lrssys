import fs from 'fs';
import path from 'path';
import { CusDecRecord, Settings, Stats } from './types';
import { getSupabase, isSupabaseConfigured } from './supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiBackupApiKey: process.env.GEMINI_BACKUP_API_KEY || '',
  geminiModel: 'gemini-3.5-flash-lite',
  autoVerifyThreshold: 90,
  workerConcurrency: 4,
  consignorConsigneeMode: 'both',
  preserveLeadingZeros: true
};

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err: any) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err: any) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
}

// In-memory cache
let recordsCache: CusDecRecord[] = readJsonFile<CusDecRecord[]>(RECORDS_FILE, []);
let settingsCache: Settings = { ...DEFAULT_SETTINGS, ...readJsonFile<Partial<Settings>>(SETTINGS_FILE, {}) };

// Supabase sync tracking
let isSupabaseInitialized = false;
let syncPromise: Promise<void> | null = null;

async function safeSupabaseExec(action: () => PromiseLike<any>, context: string): Promise<void> {
  try {
    const res = await action();
    if (res && res.error) {
      console.warn(`[Supabase ${context} Error]:`, res.error.message);
    }
  } catch (err: any) {
    console.warn(`[Supabase ${context} Exception]:`, err.message);
  }
}

function recordToRow(r: CusDecRecord) {
  return {
    id: r.id,
    filename: r.filename,
    image_url: r.imageUrl,
    original_name: r.originalName || null,
    file_hash: r.fileHash || null,
    green_stamp_number: r.greenStampNumber || '000000',
    customs_ref_number: r.customsRefNumber || 'UNKNOWN',
    customs_date: r.customsDate || null,
    consignee_name: r.consigneeName || 'UNKNOWN',
    consignee_tin: r.consigneeTIN || null,
    declarant_name: r.declarantName || 'NOT SPECIFIED',
    declarant_tin: r.declarantTIN || null,
    bl_number: r.blNumber || null,
    packages_count: r.packagesCount || null,
    goods_description: r.goodsDescription || null,
    confidence: r.confidence || 0,
    status: r.status || 'NEEDS_REVIEW',
    issues: r.issues || [],
    bounding_boxes: r.boundingBoxes || null,
    manual_correction: r.manualCorrection || false,
    macro_zoom_applied: r.macroZoomApplied || false,
    matched_master_name: r.matchedMasterName || null,
    merge_count: r.mergeCount || 1,
    created_at: r.createdAt || new Date().toISOString(),
    updated_at: r.updatedAt || new Date().toISOString()
  };
}

function rowToRecord(row: any): CusDecRecord {
  return {
    id: row.id,
    filename: row.filename,
    imagePath: row.image_url,
    imageUrl: row.image_url,
    originalName: row.original_name || undefined,
    fileHash: row.file_hash || null,
    greenStampNumber: row.green_stamp_number || '000000',
    customsRefNumber: row.customs_ref_number || 'UNKNOWN',
    customsDate: row.customs_date || '',
    consigneeName: row.consignee_name || 'UNKNOWN',
    consigneeTIN: row.consignee_tin || '',
    declarantName: row.declarant_name || 'NOT SPECIFIED',
    declarantTIN: row.declarant_tin || '',
    blNumber: row.bl_number || '',
    packagesCount: row.packages_count || '',
    goodsDescription: row.goods_description || '',
    confidence: Number(row.confidence || 0),
    status: row.status || 'NEEDS_REVIEW',
    issues: Array.isArray(row.issues) ? row.issues : [],
    boundingBoxes: row.bounding_boxes || null,
    manualCorrection: Boolean(row.manual_correction),
    macroZoomApplied: Boolean(row.macro_zoom_applied),
    matchedMasterName: row.matched_master_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mergeCount: row.merge_count || 1
  };
}

/**
 * Initialize and sync in-memory cache with Supabase database (if configured)
 */
export async function initSupabaseSync(): Promise<void> {
  if (isSupabaseInitialized || !isSupabaseConfigured()) return;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data: recordsData, error: recError } = await supabase
        .from('cusdec_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (!recError && recordsData) {
        recordsCache = recordsData.map(rowToRecord);
      }

      const { data: settingsData, error: setError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (!setError && settingsData) {
        settingsCache = {
          geminiApiKey: settingsData.gemini_api_key || settingsCache.geminiApiKey,
          geminiBackupApiKey: settingsData.gemini_backup_api_key || settingsCache.geminiBackupApiKey,
          geminiModel: settingsData.gemini_model || settingsCache.geminiModel,
          autoVerifyThreshold: settingsData.auto_verify_threshold || settingsCache.autoVerifyThreshold,
          workerConcurrency: settingsData.worker_concurrency || settingsCache.workerConcurrency,
          consignorConsigneeMode: settingsData.consignor_consignee_mode || settingsCache.consignorConsigneeMode,
          preserveLeadingZeros: settingsData.preserve_leading_zeros !== undefined ? settingsData.preserve_leading_zeros : settingsCache.preserveLeadingZeros
        };
      }

      isSupabaseInitialized = true;
    } catch (err: any) {
      console.warn('[Supabase Sync Warning]:', err.message);
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

// Background sync on startup if Supabase is active
if (isSupabaseConfigured()) {
  initSupabaseSync().catch(console.error);
}

// High-speed debounced disk persistence for local mode
let saveDebounceTimer: NodeJS.Timeout | null = null;

export function scheduleRecordsSave(): void {
  if (saveDebounceTimer) return;
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    writeJsonFile(RECORDS_FILE, recordsCache);
  }, 150);
}

export function flushRecordsSync(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  writeJsonFile(RECORDS_FILE, recordsCache);
}

if (typeof process !== 'undefined') {
  process.on('beforeExit', flushRecordsSync);
}

export function getRecords(): CusDecRecord[] {
  return recordsCache;
}

export function getRecordById(id: string): CusDecRecord | undefined {
  return recordsCache.find(r => r.id === id);
}

function getCleanOriginalName(filename?: string): string {
  if (!filename) return '';
  return path.basename(filename)
    .replace(/^(zip|doc|sample)_\d+_/, '')
    .trim();
}

function findDuplicateIndex(record: Partial<CusDecRecord>): number {
  if (record.id) {
    const byId = recordsCache.findIndex(r => r.id === record.id);
    if (byId >= 0) return byId;
  }

  if (record.fileHash) {
    const byHash = recordsCache.findIndex(r => r.fileHash && r.fileHash === record.fileHash);
    if (byHash >= 0) return byHash;
  }

  const recOriginal = (record.originalName || getCleanOriginalName(record.filename)).toLowerCase();
  if (recOriginal && recOriginal.length > 3) {
    const byName = recordsCache.findIndex(r => {
      const existingName = (r.originalName || getCleanOriginalName(r.filename)).toLowerCase();
      return existingName && existingName === recOriginal;
    });
    if (byName >= 0) return byName;
  }

  const hasValidRef = record.customsRefNumber && record.customsRefNumber !== 'UNKNOWN' && record.customsRefNumber.length >= 4;
  const hasValidStamp = record.greenStampNumber && record.greenStampNumber !== '000000' && record.greenStampNumber.length >= 4;

  if (hasValidRef && hasValidStamp) {
    const byBoth = recordsCache.findIndex(r =>
      r.customsRefNumber === record.customsRefNumber &&
      r.greenStampNumber === record.greenStampNumber
    );
    if (byBoth >= 0) return byBoth;
  }

  return -1;
}

export function saveRecord(record: CusDecRecord): CusDecRecord {
  const existingIdx = findDuplicateIndex(record);
  let saved: CusDecRecord;

  if (existingIdx >= 0) {
    const existing = recordsCache[existingIdx];
    const isManuallyCorrected = existing.status === 'CORRECTED' || existing.manualCorrection;

    saved = {
      ...existing,
      greenStampNumber: isManuallyCorrected ? existing.greenStampNumber : (record.greenStampNumber || existing.greenStampNumber),
      customsRefNumber: isManuallyCorrected ? existing.customsRefNumber : (record.customsRefNumber || existing.customsRefNumber),
      customsDate: isManuallyCorrected ? existing.customsDate : (record.customsDate || existing.customsDate),
      consigneeName: isManuallyCorrected ? existing.consigneeName : (record.consigneeName || existing.consigneeName),
      declarantName: isManuallyCorrected ? existing.declarantName : (record.declarantName || existing.declarantName),
      status: isManuallyCorrected ? 'CORRECTED' : (existing.status === 'VERIFIED' ? 'VERIFIED' : record.status),
      confidence: Math.max(existing.confidence || 0, record.confidence || 0),
      imageUrl: record.imageUrl || existing.imageUrl,
      filename: record.filename || existing.filename,
      imagePath: record.imagePath || existing.imagePath,
      fileHash: record.fileHash || existing.fileHash,
      originalName: record.originalName || existing.originalName,
      boundingBoxes: record.boundingBoxes || existing.boundingBoxes,
      updatedAt: new Date().toISOString(),
      mergeCount: (existing.mergeCount || 1) + 1
    };
    recordsCache[existingIdx] = saved;
  } else {
    saved = {
      ...record,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mergeCount: 1
    };
    recordsCache.unshift(saved);
  }

  scheduleRecordsSave();

  // Async Supabase Sync
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      safeSupabaseExec(() => supabase.from('cusdec_records').upsert(recordToRow(saved)), 'saveRecord');
    }
  }

  return saved;
}

export function updateRecord(id: string, updates: Partial<CusDecRecord>): CusDecRecord | null {
  const idx = recordsCache.findIndex(r => r.id === id);
  if (idx >= 0) {
    const current = recordsCache[idx];
    recordsCache[idx] = {
      ...current,
      ...updates,
      status: updates.status || (updates.manualCorrection ? 'CORRECTED' : current.status),
      manualCorrection: updates.manualCorrection !== undefined ? updates.manualCorrection : true,
      updatedAt: new Date().toISOString()
    };
    scheduleRecordsSave();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        safeSupabaseExec(() => supabase.from('cusdec_records').update(recordToRow(recordsCache[idx])).eq('id', id), 'updateRecord');
      }
    }

    return recordsCache[idx];
  }
  return null;
}

export async function deleteRecord(id: string): Promise<boolean> {
  const initialLen = recordsCache.length;
  recordsCache = recordsCache.filter(r => r.id !== id);
  if (recordsCache.length !== initialLen) {
    flushRecordsSync();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from('cusdec_records').delete().eq('id', id);
        } catch (err: any) {
          console.error('[Supabase Delete Error]:', err.message);
        }
      }
    }
    return true;
  }
  return false;
}

export async function deleteRecords(ids: string[]): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const initialLen = recordsCache.length;
  const idSet = new Set(ids);
  recordsCache = recordsCache.filter(r => !idSet.has(r.id));
  const deletedCount = initialLen - recordsCache.length;
  if (deletedCount > 0) {
    flushRecordsSync();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from('cusdec_records').delete().in('id', ids);
        } catch (err: any) {
          console.error('[Supabase Bulk Delete Error]:', err.message);
        }
      }
    }
  }
  return deletedCount;
}

export async function clearAllRecords(): Promise<boolean> {
  recordsCache = [];
  flushRecordsSync();

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('cusdec_records').delete().not('id', 'is', null);
      } catch (err: any) {
        console.error('[Supabase Clear All Error]:', err.message);
      }
    }
  }

  return true;
}

export function deduplicateExistingRecords(): number {
  const seen = new Map<string, CusDecRecord>();
  let removedCount = 0;

  for (const r of recordsCache) {
    const cleanName = (r.originalName || getCleanOriginalName(r.filename)).toLowerCase();
    const key = cleanName || (r.customsRefNumber && r.greenStampNumber && r.customsRefNumber !== 'UNKNOWN' ? `${r.customsRefNumber}_${r.greenStampNumber}` : r.id);

    if (seen.has(key)) {
      const existing = seen.get(key)!;
      if (r.status === 'CORRECTED' || r.manualCorrection) {
        seen.set(key, { ...r, mergeCount: (existing.mergeCount || 1) + 1 });
      } else {
        existing.mergeCount = (existing.mergeCount || 1) + 1;
      }
      removedCount++;
    } else {
      seen.set(key, r);
    }
  }

  if (removedCount > 0) {
    recordsCache = Array.from(seen.values());
    flushRecordsSync();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        safeSupabaseExec(() => supabase.from('cusdec_records').upsert(recordsCache.map(recordToRow)), 'deduplicate');
      }
    }
  }
  return removedCount;
}

export function getSettings(): Settings {
  return settingsCache;
}

export function updateSettings(updates: Partial<Settings>): Settings {
  settingsCache = {
    ...settingsCache,
    ...updates
  };
  writeJsonFile(SETTINGS_FILE, settingsCache);

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      safeSupabaseExec(() => supabase.from('app_settings').upsert({
        id: 'default',
        gemini_api_key: settingsCache.geminiApiKey || null,
        gemini_backup_api_key: settingsCache.geminiBackupApiKey || null,
        gemini_model: settingsCache.geminiModel,
        auto_verify_threshold: settingsCache.autoVerifyThreshold,
        worker_concurrency: settingsCache.workerConcurrency,
        consignor_consignee_mode: settingsCache.consignorConsigneeMode,
        preserve_leading_zeros: settingsCache.preserveLeadingZeros,
        updated_at: new Date().toISOString()
      }), 'updateSettings');
    }
  }

  return settingsCache;
}

export function getStats(): Stats {
  const total = recordsCache.length;
  const verified = recordsCache.filter(r => r.status === 'VERIFIED').length;
  const needsReview = recordsCache.filter(r => r.status === 'NEEDS_REVIEW').length;
  const corrected = recordsCache.filter(r => r.status === 'CORRECTED').length;
  const accuracyRate = total > 0 ? (((verified + corrected) / total) * 100).toFixed(1) : '100.0';

  return {
    total,
    verified,
    needsReview,
    corrected,
    accuracyRate: parseFloat(accuracyRate)
  };
}
