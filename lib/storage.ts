import fs from 'fs';
import path from 'path';
import { getSupabase, isSupabaseConfigured } from './supabase';

const BUCKET_NAME = 'cusdec-documents';
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB default (Supabase free tier quota)

export interface StoredFile {
  publicUrl: string;
  storagePath: string;
  isCloud: boolean;
}

export interface StorageStats {
  provider: 'supabase' | 'local' | 'hybrid';
  bucketName: string;
  totalFiles: number;
  totalBytes: number;
  totalFormatted: string;
  quotaBytes: number;
  quotaFormatted: string;
  percentUsed: number;
  cloudFiles: number;
  cloudBytes: number;
  cloudFormatted: string;
  localFiles: number;
  localBytes: number;
  localFormatted: string;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0.00 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Upload a document buffer to Supabase Storage if configured, or local uploads/ directory as fallback
 */
export async function uploadDocumentFile(
  buffer: Buffer,
  filename: string,
  contentType: string = 'image/jpeg'
): Promise<StoredFile> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    try {
      const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `declarations/${Date.now()}_${cleanName}`;

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, buffer, {
          contentType,
          upsert: true
        });

      if (error) {
        console.warn(`[Supabase Storage] Upload error (${error.message}). Falling back to local disk.`);
      } else {
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(storagePath);

        return {
          publicUrl: publicUrlData.publicUrl,
          storagePath,
          isCloud: true
        };
      }
    } catch (err: any) {
      console.warn(`[Supabase Storage Exception]: ${err.message}. Falling back to local disk.`);
    }
  }

  // Local Disk Fallback
  try {
    if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
      fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
    }

    const localFilePath = path.join(LOCAL_UPLOADS_DIR, filename);
    fs.writeFileSync(localFilePath, buffer);

    return {
      publicUrl: `/api/images/${encodeURIComponent(filename)}`,
      storagePath: localFilePath,
      isCloud: false
    };
  } catch (diskErr: any) {
    console.warn(`[Local Disk Fallback Warning]: ${diskErr.message}`);
    return {
      publicUrl: '',
      storagePath: filename,
      isCloud: false
    };
  }
}

/**
 * Delete a document from Supabase Storage or local disk
 */
export async function deleteDocumentFile(storagePath: string): Promise<boolean> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured() && !path.isAbsolute(storagePath)) {
    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);
      return !error;
    } catch (e) {
      return false;
    }
  }

  if (fs.existsSync(storagePath)) {
    try {
      fs.unlinkSync(storagePath);
      return true;
    } catch (e) {
      return false;
    }
  }

  return false;
}

// In-memory telemetry cache with 60-second TTL to avoid slamming Supabase Storage on every file upload
let cachedStorageStats: StorageStats | null = null;
let lastStorageStatsFetch = 0;
const STATS_CACHE_TTL_MS = 60 * 1000;

export function incrementStorageCache(addedBytes: number): void {
  if (!cachedStorageStats) return;
  cachedStorageStats.totalFiles += 1;
  cachedStorageStats.totalBytes += addedBytes;
  cachedStorageStats.totalFormatted = formatBytes(cachedStorageStats.totalBytes);
  cachedStorageStats.percentUsed = parseFloat(((cachedStorageStats.totalBytes / cachedStorageStats.quotaBytes) * 100).toFixed(2));
  if (cachedStorageStats.provider === 'supabase' || cachedStorageStats.provider === 'hybrid') {
    cachedStorageStats.cloudFiles += 1;
    cachedStorageStats.cloudBytes += addedBytes;
    cachedStorageStats.cloudFormatted = formatBytes(cachedStorageStats.cloudBytes);
  } else {
    cachedStorageStats.localFiles += 1;
    cachedStorageStats.localBytes += addedBytes;
    cachedStorageStats.localFormatted = formatBytes(cachedStorageStats.localBytes);
  }
}

export function invalidateStorageCache(): void {
  cachedStorageStats = null;
  lastStorageStatsFetch = 0;
}

/**
 * Get comprehensive telemetry on storage bucket & local uploads usage with 60s in-memory caching
 */
export async function getStorageStats(forceRefresh = false): Promise<StorageStats> {
  const now = Date.now();
  if (!forceRefresh && cachedStorageStats && (now - lastStorageStatsFetch < STATS_CACHE_TTL_MS)) {
    return cachedStorageStats;
  }

  const isCloud = isSupabaseConfigured();
  const supabase = getSupabase();

  let cloudBytes = 0;
  let cloudFiles = 0;
  let localBytes = 0;
  let localFiles = 0;

  // 1. Inspect Supabase Cloud Storage
  if (supabase && isCloud) {
    try {
      // Check declarations folder where documents are stored
      const { data: cloudList, error: decError } = await supabase.storage
        .from(BUCKET_NAME)
        .list('declarations', { limit: 1000 });

      if (!decError && cloudList) {
        for (const item of cloudList) {
          if (item.name && !item.name.endsWith('/')) {
            cloudFiles++;
            const size = Number(item.metadata?.size || (item as any).size || 0);
            cloudBytes += size;
          }
        }
      }

      // Also inspect root bucket for any files
      const { data: rootList, error: rootError } = await supabase.storage
        .from(BUCKET_NAME)
        .list('', { limit: 1000 });

      if (!rootError && rootList) {
        for (const item of rootList) {
          if (item.name && item.name !== 'declarations' && !item.name.endsWith('/')) {
            cloudFiles++;
            const size = Number(item.metadata?.size || (item as any).size || 0);
            cloudBytes += size;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Storage Stats] Error querying Supabase storage:', err.message);
    }
  }

  // 2. Inspect Local uploads directory
  if (fs.existsSync(LOCAL_UPLOADS_DIR)) {
    try {
      const files = fs.readdirSync(LOCAL_UPLOADS_DIR);
      localFiles = files.length;
      for (const file of files) {
        try {
          const stat = fs.statSync(path.join(LOCAL_UPLOADS_DIR, file));
          localBytes += stat.size;
        } catch (e) {}
      }
    } catch (err: any) {
      console.warn('[Storage Stats] Error querying local uploads:', err.message);
    }
  }

  const totalFiles = cloudFiles + localFiles;
  const totalBytes = cloudBytes + localBytes;
  const quotaBytes = DEFAULT_QUOTA_BYTES;
  const percentUsed = parseFloat(((totalBytes / quotaBytes) * 100).toFixed(2));

  let provider: 'supabase' | 'local' | 'hybrid' = 'local';
  if (isCloud && localFiles > 0) provider = 'hybrid';
  else if (isCloud) provider = 'supabase';

  const stats: StorageStats = {
    provider,
    bucketName: BUCKET_NAME,
    totalFiles,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    quotaBytes,
    quotaFormatted: formatBytes(quotaBytes),
    percentUsed,
    cloudFiles,
    cloudBytes,
    cloudFormatted: formatBytes(cloudBytes),
    localFiles,
    localBytes,
    localFormatted: formatBytes(localBytes)
  };

  cachedStorageStats = stats;
  lastStorageStatsFetch = Date.now();
  return stats;
}

/**
 * Purge files from Supabase Storage and/or local uploads
 */
export async function purgeStorageFiles(
  action: 'all' | 'orphans',
  activeFilenames: string[] = []
): Promise<{ deletedCount: number; freedBytes: number; message: string }> {
  const isCloud = isSupabaseConfigured();
  const supabase = getSupabase();
  const activeSet = new Set(activeFilenames.map(f => path.basename(f).toLowerCase()));

  let deletedCount = 0;
  let freedBytes = 0;

  // 1. Purge Cloud Storage
  if (supabase && isCloud) {
    try {
      const { data: cloudList } = await supabase.storage
        .from(BUCKET_NAME)
        .list('declarations', { limit: 1000 });

      if (cloudList && cloudList.length > 0) {
        const toDelete: string[] = [];
        for (const item of cloudList) {
          const itemName = item.name.toLowerCase();
          const isReferenced = activeFilenames.some(f => f.toLowerCase().includes(itemName) || itemName.includes(f.toLowerCase()));

          if (action === 'all' || !isReferenced) {
            toDelete.push(`declarations/${item.name}`);
            freedBytes += item.metadata?.size || 0;
          }
        }

        if (toDelete.length > 0) {
          const { error: delErr } = await supabase.storage.from(BUCKET_NAME).remove(toDelete);
          if (!delErr) {
            deletedCount += toDelete.length;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Storage Purge] Cloud storage deletion error:', err.message);
    }
  }

  // 2. Purge Local uploads
  if (fs.existsSync(LOCAL_UPLOADS_DIR)) {
    try {
      const files = fs.readdirSync(LOCAL_UPLOADS_DIR);
      for (const file of files) {
        const fileNameLower = file.toLowerCase();
        const isReferenced = activeFilenames.some(f => f.toLowerCase().includes(fileNameLower) || fileNameLower.includes(f.toLowerCase()));

        if (action === 'all' || !isReferenced) {
          const fullPath = path.join(LOCAL_UPLOADS_DIR, file);
          try {
            const size = fs.statSync(fullPath).size;
            fs.unlinkSync(fullPath);
            deletedCount++;
            freedBytes += size;
          } catch (e) {}
        }
      }
    } catch (err: any) {
      console.warn('[Storage Purge] Local uploads deletion error:', err.message);
    }
  }

  invalidateStorageCache();
  return {
    deletedCount,
    freedBytes,
    message: `Successfully deleted ${deletedCount} file(s) and freed ${formatBytes(freedBytes)}.`
  };
}
