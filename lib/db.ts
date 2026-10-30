import fs from 'fs';
import path from 'path';
import { CusDecRecord, Settings, Stats } from './types';

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

// High-speed debounced disk persistence
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

  if (existingIdx >= 0) {
    const existing = recordsCache[existingIdx];
    const isManuallyCorrected = existing.status === 'CORRECTED' || existing.manualCorrection;

    recordsCache[existingIdx] = {
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
    scheduleRecordsSave();
    return recordsCache[existingIdx];
  } else {
    recordsCache.unshift({
      ...record,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mergeCount: 1
    });
    scheduleRecordsSave();
    return record;
  }
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
    return recordsCache[idx];
  }
  return null;
}

export function deleteRecord(id: string): boolean {
  const initialLen = recordsCache.length;
  recordsCache = recordsCache.filter(r => r.id !== id);
  if (recordsCache.length !== initialLen) {
    scheduleRecordsSave();
    return true;
  }
  return false;
}

export function deleteRecords(ids: string[]): number {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const initialLen = recordsCache.length;
  const idSet = new Set(ids);
  recordsCache = recordsCache.filter(r => !idSet.has(r.id));
  const deletedCount = initialLen - recordsCache.length;
  if (deletedCount > 0) {
    scheduleRecordsSave();
  }
  return deletedCount;
}

export function clearAllRecords(): boolean {
  recordsCache = [];
  flushRecordsSync();
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
