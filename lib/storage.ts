import fs from 'fs';
import path from 'path';
import { getSupabase, isSupabaseConfigured } from './supabase';

const BUCKET_NAME = 'cusdec-documents';
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export interface StoredFile {
  publicUrl: string;
  storagePath: string;
  isCloud: boolean;
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
