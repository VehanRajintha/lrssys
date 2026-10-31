import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import crypto from 'crypto';
import queue from '@/lib/queue';
import * as db from '@/lib/db';
import * as extractor from '@/lib/extractor';
import { uploadDocumentFile, getStorageStats, incrementStorageCache } from '@/lib/storage';
import { CusDecRecord } from '@/lib/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const processSync = searchParams.get('process') === '1' || searchParams.get('process') === 'true';
    const workerParam = searchParams.get('worker');
    const workerStreamId = workerParam ? parseInt(workerParam, 10) : undefined;

    const formData = await request.formData();
    const files = formData.getAll('documents') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files were uploaded.' }, { status: 400 });
    }

    if (processSync) {
      await db.initSupabaseSync();
      const settings = db.getSettings();
      const processedRecords: CusDecRecord[] = [];

      for (const file of files) {
        if (!file.name || typeof file.arrayBuffer !== 'function') continue;

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fileHash = crypto.createHash('md5').update(buffer).digest('hex');

        const ext = path.extname(file.name);
        const cleanBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${cleanBase}_${Date.now()}${ext}`;

        // High-speed parallel execution: Upload to cloud storage & run Vision AI in parallel
        const [stored, extractionResult] = await Promise.all([
          uploadDocumentFile(buffer, filename, file.type || 'image/jpeg'),
          extractor.extractDocumentData(buffer, settings, filename, workerStreamId).catch(async (err: any) => {
            console.error(`[Extraction error on ${file.name}]:`, err.message);
            // Rescue retry with alternate key
            try {
              await new Promise(r => setTimeout(r, 800));
              return await extractor.extractDocumentData(buffer, settings, filename, (workerStreamId ? workerStreamId + 1 : 2));
            } catch (rescueErr: any) {
              console.error(`[Rescue pass failed for ${file.name}]:`, rescueErr.message);
              const fallback: CusDecRecord = {
                id: 'REC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                filename,
                imagePath: '',
                imageUrl: '',
                originalName: file.name,
                fileHash,
                greenStampNumber: '000000',
                customsRefNumber: 'UNKNOWN',
                customsDate: new Date().toLocaleDateString('en-GB'),
                consigneeName: 'UNKNOWN CONSIGNEE',
                consigneeTIN: '',
                declarantName: 'UNKNOWN DECLARANT',
                declarantTIN: '',
                blNumber: '',
                packagesCount: '',
                goodsDescription: '',
                confidence: 25,
                status: 'NEEDS_REVIEW',
                issues: [`Extraction error: ${rescueErr.message}`],
                boundingBoxes: null,
                manualCorrection: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              return fallback;
            }
          })
        ]);

        const targetPath = stored.isCloud ? stored.publicUrl : stored.storagePath;
        const extractedRecord: CusDecRecord = {
          ...extractionResult,
          originalName: file.name,
          fileHash,
          imageUrl: stored.publicUrl,
          imagePath: targetPath
        };

        const saved = await db.saveRecord(extractedRecord);
        processedRecords.push(saved);
        incrementStorageCache(buffer.length);
      }

      const storageStats = await getStorageStats();

      return NextResponse.json({
        success: true,
        message: `Successfully processed ${processedRecords.length} document(s)`,
        records: processedRecords,
        record: processedRecords[0] || null,
        stats: db.getStats(),
        storageStats
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    const enqueuedFiles: Array<{ filePath: string; originalName: string; fileHash: string | null; imageUrl?: string }> = [];

    for (const file of files) {
      if (!file.name || typeof file.arrayBuffer !== 'function') continue;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileHash = crypto.createHash('md5').update(buffer).digest('hex');

      const ext = path.extname(file.name);
      const cleanBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanBase}_${Date.now()}${ext}`;

      const stored = await uploadDocumentFile(buffer, filename, file.type || 'image/jpeg');

      enqueuedFiles.push({
        filePath: stored.isCloud ? stored.publicUrl : stored.storagePath,
        imageUrl: stored.publicUrl,
        originalName: file.name,
        fileHash
      });
    }

    if (enqueuedFiles.length === 0) {
      return NextResponse.json({ error: 'No valid documents processed.' }, { status: 400 });
    }

    queue.enqueue(enqueuedFiles);

    return NextResponse.json({
      message: `Successfully enqueued ${enqueuedFiles.length} file(s). Duplicate uploads will auto-merge.`,
      count: enqueuedFiles.length,
      status: queue.getStatus()
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (err: any) {
    console.error('Upload Error:', err);
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }
}
