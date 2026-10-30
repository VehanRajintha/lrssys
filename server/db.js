const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_SETTINGS = {
  geminiApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  autoVerifyThreshold: 90,
  workerConcurrency: 3,
  consignorConsigneeMode: 'both', // 'both' | 'consignee_only' | 'consignor_only'
  preserveLeadingZeros: true
};

function readJsonFile(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  try {
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
}

// In-memory cache
let recordsCache = readJsonFile(RECORDS_FILE, []);
let settingsCache = { ...DEFAULT_SETTINGS, ...readJsonFile(SETTINGS_FILE, {}) };

function getRecords() {
  return recordsCache;
}

function getRecordById(id) {
  return recordsCache.find(r => r.id === id);
}

function getCleanOriginalName(filename) {
  if (!filename) return '';
  return path.basename(filename)
    .replace(/^(zip|doc|sample)_\d+_/, '')
    .trim();
}

function findDuplicateIndex(record) {
  // 1. Exact ID match
  if (record.id) {
    const byId = recordsCache.findIndex(r => r.id === record.id);
    if (byId >= 0) return byId;
  }

  // 2. MD5 Content Hash match (identical file uploaded again)
  if (record.fileHash) {
    const byHash = recordsCache.findIndex(r => r.fileHash && r.fileHash === record.fileHash);
    if (byHash >= 0) return byHash;
  }

  // 3. Original Filename match (e.g. WhatsApp Image 2026-10-30 at 2.49.26 PM.jpeg)
  const recOriginal = (record.originalName || getCleanOriginalName(record.filename)).toLowerCase();
  if (recOriginal && recOriginal.length > 3) {
    const byName = recordsCache.findIndex(r => {
      const existingName = (r.originalName || getCleanOriginalName(r.filename)).toLowerCase();
      return existingName && existingName === recOriginal;
    });
    if (byName >= 0) return byName;
  }

  // 4. Customs Reference Number + Counter Stamp match (when both extracted and valid)
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

function saveRecord(record) {
  const existingIdx = findDuplicateIndex(record);

  if (existingIdx >= 0) {
    const existing = recordsCache[existingIdx];
    console.log(`[Auto-Merge Duplicate] Duplicate detected for '${record.originalName || record.filename || record.customsRefNumber}'. Merging into existing record ${existing.id}...`);

    const isManuallyCorrected = existing.status === 'CORRECTED' || existing.manualCorrection;

    recordsCache[existingIdx] = {
      ...existing,
      // If user manually corrected fields, preserve user's verified values!
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
      updatedAt: new Date().toISOString(),
      mergeCount: (existing.mergeCount || 1) + 1
    };
    writeJsonFile(RECORDS_FILE, recordsCache);
    return recordsCache[existingIdx];
  } else {
    recordsCache.unshift({
      ...record,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mergeCount: 1
    });
    writeJsonFile(RECORDS_FILE, recordsCache);
    return record;
  }
}

function deduplicateExistingRecords() {
  const seen = new Map();
  let removedCount = 0;

  for (const r of recordsCache) {
    const cleanName = (r.originalName || getCleanOriginalName(r.filename)).toLowerCase();
    const key = cleanName || (r.customsRefNumber && r.greenStampNumber && r.customsRefNumber !== 'UNKNOWN' ? `${r.customsRefNumber}_${r.greenStampNumber}` : r.id);

    if (seen.has(key)) {
      const existing = seen.get(key);
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
    writeJsonFile(RECORDS_FILE, recordsCache);
    console.log(`[Deduplicate] Cleaned up ${removedCount} duplicate records. Current unique count: ${recordsCache.length}`);
  }
  return removedCount;
}

// Automatically deduplicate existing database on module load
deduplicateExistingRecords();

function updateRecord(id, updates) {
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
    writeJsonFile(RECORDS_FILE, recordsCache);
    return recordsCache[idx];
  }
  return null;
}

function deleteRecord(id) {
  const initialLen = recordsCache.length;
  recordsCache = recordsCache.filter(r => r.id !== id);
  if (recordsCache.length !== initialLen) {
    writeJsonFile(RECORDS_FILE, recordsCache);
    return true;
  }
  return false;
}

function deleteRecords(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const initialLen = recordsCache.length;
  const idSet = new Set(ids);
  recordsCache = recordsCache.filter(r => !idSet.has(r.id));
  const deletedCount = initialLen - recordsCache.length;
  if (deletedCount > 0) {
    writeJsonFile(RECORDS_FILE, recordsCache);
  }
  return deletedCount;
}

function clearAllRecords() {
  recordsCache = [];
  writeJsonFile(RECORDS_FILE, recordsCache);
  return true;
}

function getSettings() {
  return settingsCache;
}

function updateSettings(updates) {
  settingsCache = {
    ...settingsCache,
    ...updates
  };
  writeJsonFile(SETTINGS_FILE, settingsCache);
  return settingsCache;
}

function getStats() {
  const total = recordsCache.length;
  const verified = recordsCache.filter(r => r.status === 'VERIFIED').length;
  const needsReview = recordsCache.filter(r => r.status === 'NEEDS_REVIEW').length;
  const corrected = recordsCache.filter(r => r.status === 'CORRECTED').length;
  const accuracyRate = total > 0 ? (((verified + corrected) / total) * 100).toFixed(1) : 100;

  return {
    total,
    verified,
    needsReview,
    corrected,
    accuracyRate: parseFloat(accuracyRate)
  };
}

module.exports = {
  getRecords,
  getRecordById,
  saveRecord,
  updateRecord,
  deleteRecord,
  deleteRecords,
  clearAllRecords,
  deduplicateExistingRecords,
  getSettings,
  updateSettings,
  getStats
};

