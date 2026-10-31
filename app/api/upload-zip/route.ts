import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import queue from '@/lib/queue';
import { uploadDocumentFile } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const zipFile = formData.get('zipfile') as File | null;

    if (!zipFile) {
      return NextResponse.json({ error: 'No ZIP archive uploaded.' }, { status: 400 });
    }

    const bytes = await zipFile.arrayBuffer();
    const zipBuffer = Buffer.from(bytes);
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    const extractedFiles: Array<{ filePath: string; originalName: string; fileHash: string; imageUrl?: string }> = [];

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

    for (const entry of zipEntries) {
      if (!entry.isDirectory) {
        const ext = path.extname(entry.entryName).toLowerCase();
        if (allowedExtensions.includes(ext)) {
          const cleanName = path.basename(entry.entryName);
          const dataBuf = entry.getData();
          const fileHash = crypto.createHash('md5').update(dataBuf).digest('hex');
          const destName = `zip_${Date.now()}_${cleanName}`;
          const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';

          const stored = await uploadDocumentFile(dataBuf, destName, mimeType);

          extractedFiles.push({
            filePath: stored.isCloud ? stored.publicUrl : stored.storagePath,
            imageUrl: stored.publicUrl,
            originalName: cleanName,
            fileHash
          });
        }
      }
    }

    if (extractedFiles.length === 0) {
      return NextResponse.json({ error: 'No valid image files found inside the ZIP archive.' }, { status: 400 });
    }

    queue.enqueue(extractedFiles);

    return NextResponse.json({
      message: `Unzipped and enqueued ${extractedFiles.length} images from archive. Duplicate declarations will auto-merge cleanly.`,
      count: extractedFiles.length,
      status: queue.getStatus()
    });
  } catch (err: any) {
    console.error('ZIP extraction error:', err);
    return NextResponse.json({ error: `Failed to process ZIP archive: ${err.message}` }, { status: 500 });
  }
}
