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
  geminiApiKey3: process.env.GEMINI_API_KEY_3 || '',
  customApiKey: '',
  useCustomApiKey: false,
  geminiModel: 'gemini-3.5-flash-lite',
  autoVerifyThreshold: 90,
  workerConcurrency: 6,
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
  const issues = Array.isArray(row.issues) ? row.issues : [];
  const isDuplicate = Boolean(row.is_duplicate);
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
    issues,
    boundingBoxes: row.bounding_boxes || null,
    manualCorrection: Boolean(row.manual_correction),
    macroZoomApplied: Boolean(row.macro_zoom_applied),
    matchedMasterName: row.matched_master_name || null,
    isDuplicate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mergeCount: row.merge_count || 1
  };
}

/**
 * Initialize and sync in-memory cache with Supabase database (if configured)
 */
export async function initSupabaseSync(force = false): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!force && isSupabaseInitialized) return;
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
        syncLedgerDuplicateFlags();
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
          geminiApiKey3: settingsData.gemini_api_key_3 || settingsCache.geminiApiKey3 || process.env.GEMINI_API_KEY_3 || '',
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

export async function getFreshRecords(): Promise<CusDecRecord[]> {
  await initSupabaseSync(true);
  syncLedgerDuplicateFlags();
  return recordsCache;
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

/**
 * Strict declaration duplicate matching based on at least 3 critical matching fields
 * (Stamp Duty No, Customs Ref, Consignee Name, Declarant Name)
 */
export function isDuplicateDeclaration(a: Partial<CusDecRecord>, b: Partial<CusDecRecord>): boolean {
  if (a.id && b.id && a.id === b.id) return false;

  const aStamp = a.greenStampNumber && a.greenStampNumber !== '000000' && a.greenStampNumber.length >= 4 
    ? a.greenStampNumber.trim() 
    : null;
  const bStamp = b.greenStampNumber && b.greenStampNumber !== '000000' && b.greenStampNumber.length >= 4 
    ? b.greenStampNumber.trim() 
    : null;

  const aRef = a.customsRefNumber && a.customsRefNumber !== 'UNKNOWN' && a.customsRefNumber.length >= 4 
    ? a.customsRefNumber.replace(/\s+/g, '').toUpperCase() 
    : null;
  const bRef = b.customsRefNumber && b.customsRefNumber !== 'UNKNOWN' && b.customsRefNumber.length >= 4 
    ? b.customsRefNumber.replace(/\s+/g, '').toUpperCase() 
    : null;

  const aConsignee = a.consigneeName && a.consigneeName !== 'UNKNOWN' && a.consigneeName.length >= 3 
    ? a.consigneeName.trim().toUpperCase() 
    : null;
  const bConsignee = b.consigneeName && b.consigneeName !== 'UNKNOWN' && b.consigneeName.length >= 3 
    ? b.consigneeName.trim().toUpperCase() 
    : null;

  const aDeclarant = a.declarantName && a.declarantName !== 'NOT SPECIFIED' && a.declarantName.length >= 3 
    ? a.declarantName.trim().toUpperCase() 
    : null;
  const bDeclarant = b.declarantName && b.declarantName !== 'NOT SPECIFIED' && b.declarantName.length >= 3 
    ? b.declarantName.trim().toUpperCase() 
    : null;

  const aDate = a.customsDate && a.customsDate.trim().length >= 6 ? a.customsDate.trim() : null;
  const bDate = b.customsDate && b.customsDate.trim().length >= 6 ? b.customsDate.trim() : null;

  let matchPoints = 0;
  if (aStamp && bStamp && aStamp === bStamp) matchPoints++;
  if (aRef && bRef && aRef === bRef) matchPoints++;
  if (aConsignee && bConsignee && (aConsignee === bConsignee || aConsignee.includes(bConsignee) || bConsignee.includes(aConsignee))) matchPoints++;
  if (aDeclarant && bDeclarant && (aDeclarant === bDeclarant || aDeclarant.includes(bDeclarant) || bDeclarant.includes(aDeclarant))) matchPoints++;
  if (aDate && bDate && aDate === bDate) matchPoints++;

  // Must match Stamp + Customs Ref AND at least one other field (Consignee, Declarant, or Customs Date), reaching at least 3 matching critical fields
  if (aStamp && bStamp && aStamp === bStamp && aRef && bRef && aRef === bRef && matchPoints >= 3) {
    return true;
  }

  // Exact binary file hash match + at least stamp or ref match
  if (a.fileHash && b.fileHash && a.fileHash === b.fileHash && (aStamp === bStamp || aRef === bRef)) {
    return true;
  }

  return false;
}

/**
 * Dynamically re-synchronizes duplicate flags across the entire recordsCache.
 * Guarantees that a declaration is NEVER marked duplicate if it is the only one in the ledger.
 * The earliest declaration in a cluster remains clean/primary, and redundant copies are flagged.
 */
export function syncLedgerDuplicateFlags(): void {
  const n = recordsCache.length;
  if (n === 0) return;

  const seenGroup = new Set<number>();
  const dupIds = new Set<string>();

  for (let i = 0; i < n; i++) {
    if (seenGroup.has(i)) continue;
    const primary = recordsCache[i];
    let hasDup = false;

    for (let j = i + 1; j < n; j++) {
      if (seenGroup.has(j)) continue;
      if (isDuplicateDeclaration(primary, recordsCache[j])) {
        recordsCache[j].isDuplicate = true;
        dupIds.add(recordsCache[j].id);
        seenGroup.add(j);
        hasDup = true;
      }
    }

    recordsCache[i].isDuplicate = false;
    if (hasDup) {
      seenGroup.add(i);
    }
  }

  // Clear isDuplicate flag and issues for any record that does not belong to an active duplicate cluster
  for (const r of recordsCache) {
    if (!dupIds.has(r.id)) {
      r.isDuplicate = false;
      if (r.issues && r.issues.length > 0) {
        r.issues = r.issues.filter(iss => !iss.toLowerCase().includes('duplicate'));
      }
    }
  }
}

function findDuplicateIndex(record: Partial<CusDecRecord>): number {
  if (record.id) {
    const byId = recordsCache.findIndex(r => r.id === record.id);
    if (byId >= 0) return byId;
  }

  return recordsCache.findIndex(existing => isDuplicateDeclaration(record, existing));
}

export async function saveRecord(record: CusDecRecord): Promise<CusDecRecord> {
  // Only update in-place if an identical record ID already exists in cache
  const existingById = record.id ? recordsCache.findIndex(r => r.id === record.id) : -1;
  let saved: CusDecRecord;

  if (existingById >= 0) {
    const existing = recordsCache[existingById];
    saved = {
      ...existing,
      ...record,
      updatedAt: new Date().toISOString()
    };
    recordsCache[existingById] = saved;
  } else {
    // New uploaded document! Check if it is a duplicate of an existing declaration
    const isDup = findDuplicateIndex(record) >= 0;
    const issues = Array.isArray(record.issues) ? [...record.issues] : [];
    if (isDup && !issues.some(i => i.toLowerCase().includes('duplicate'))) {
      issues.push('Duplicate declaration entry');
    }

    saved = {
      ...record,
      id: record.id || ('REC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
      isDuplicate: isDup,
      issues,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mergeCount: 1
    };
    // Prepend new record so EVERY uploaded file gets its own row in the ledger!
    recordsCache.unshift(saved);
  }

  syncLedgerDuplicateFlags();
  scheduleRecordsSave();

  // Await Supabase Sync so data is guaranteed committed in database before responding
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      await safeSupabaseExec(() => supabase.from('cusdec_records').upsert(recordToRow(saved)), 'saveRecord');
    }
  }

  return saved;
}

export async function updateRecord(id: string, updates: Partial<CusDecRecord>): Promise<CusDecRecord | null> {
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
        await safeSupabaseExec(() => supabase.from('cusdec_records').update(recordToRow(recordsCache[idx])).eq('id', id), 'updateRecord');
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
    syncLedgerDuplicateFlags();
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
    syncLedgerDuplicateFlags();
    flushRecordsSync();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          for (let i = 0; i < ids.length; i += 50) {
            const chunk = ids.slice(i, i + 50);
            await supabase.from('cusdec_records').delete().in('id', chunk);
          }
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
        await supabase.from('cusdec_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (err: any) {
        console.error('[Supabase Clear All Error]:', err.message);
      }
    }
  }

  return true;
}

export async function deduplicateExistingRecords(): Promise<number> {
  const duplicateIdsToRemove: string[] = [];
  const n = recordsCache.length;
  const markedDups = new Set<number>();

  for (let i = 0; i < n; i++) {
    if (markedDups.has(i)) continue;
    const primary = recordsCache[i];
    for (let j = i + 1; j < n; j++) {
      if (markedDups.has(j)) continue;
      if (isDuplicateDeclaration(primary, recordsCache[j])) {
        duplicateIdsToRemove.push(recordsCache[j].id);
        markedDups.add(j);
      }
    }
  }

  if (duplicateIdsToRemove.length > 0) {
    const idSet = new Set(duplicateIdsToRemove);
    recordsCache = recordsCache.filter(r => !idSet.has(r.id));
    syncLedgerDuplicateFlags();
    flushRecordsSync();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          for (let i = 0; i < duplicateIdsToRemove.length; i += 50) {
            const chunk = duplicateIdsToRemove.slice(i, i + 50);
            await supabase.from('cusdec_records').delete().in('id', chunk);
          }
        } catch (err: any) {
          console.error('[Supabase Deduplicate Delete Error]:', err.message);
        }
      }
    }
  }
  return duplicateIdsToRemove.length;
}

export function getSettings(): Settings {
  return settingsCache;
}

export function updateSettings(updates: Partial<Settings>): Settings {
  settingsCache = {
    ...settingsCache,
    ...updates,
    geminiApiKey: process.env.GEMINI_API_KEY || settingsCache.geminiApiKey,
    geminiBackupApiKey: process.env.GEMINI_BACKUP_API_KEY || settingsCache.geminiBackupApiKey,
    geminiApiKey3: updates.geminiApiKey3 !== undefined ? updates.geminiApiKey3 : (settingsCache.geminiApiKey3 || process.env.GEMINI_API_KEY_3 || ''),
    customApiKey: updates.customApiKey !== undefined ? updates.customApiKey : (settingsCache.customApiKey || ''),
    useCustomApiKey: updates.useCustomApiKey !== undefined ? Boolean(updates.useCustomApiKey) : (settingsCache.useCustomApiKey || false)
  };
  writeJsonFile(SETTINGS_FILE, settingsCache);

  if (updates.geminiApiKey3 !== undefined) {
    process.env.GEMINI_API_KEY_3 = updates.geminiApiKey3;
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        let envText = fs.readFileSync(envPath, 'utf8');
        if (envText.includes('GEMINI_API_KEY_3=')) {
          envText = envText.replace(/GEMINI_API_KEY_3=.*(\r?\n|$)/, `GEMINI_API_KEY_3=${updates.geminiApiKey3}$1`);
        } else {
          envText += `\nGEMINI_API_KEY_3=${updates.geminiApiKey3}\n`;
        }
        fs.writeFileSync(envPath, envText, 'utf8');
      }
    } catch (e: any) {
      console.warn('Could not persist GEMINI_API_KEY_3 to .env.local:', e.message);
    }
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      safeSupabaseExec(async () => {
        const payload: any = {
          id: 'default',
          gemini_api_key: settingsCache.geminiApiKey || null,
          gemini_backup_api_key: settingsCache.geminiBackupApiKey || null,
          gemini_model: settingsCache.geminiModel,
          auto_verify_threshold: settingsCache.autoVerifyThreshold,
          worker_concurrency: settingsCache.workerConcurrency,
          consignor_consignee_mode: settingsCache.consignorConsigneeMode,
          preserve_leading_zeros: settingsCache.preserveLeadingZeros,
          updated_at: new Date().toISOString()
        };
        // Try with gemini_api_key_3 if set, fallback if column missing in Supabase schema
        if (settingsCache.geminiApiKey3) {
          const res = await supabase.from('app_settings').upsert({ ...payload, gemini_api_key_3: settingsCache.geminiApiKey3 });
          if (!res.error) return res;
        }
        return await supabase.from('app_settings').upsert(payload);
      }, 'updateSettings');
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
