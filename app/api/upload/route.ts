import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import queue from '@/lib/queue';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('documents') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files were uploaded.' }, { status: 400 });
    }

    const enqueuedFiles: Array<{ filePath: string; originalName: string; fileHash: string | null }> = [];

    for (const file of files) {
      if (!file.name || typeof file.arrayBuffer !== 'function') continue;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileHash = crypto.createHash('md5').update(buffer).digest('hex');

      const ext = path.extname(file.name);
      const cleanBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanBase}_${Date.now()}${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filePath, buffer);

      enqueuedFiles.push({
        filePath,
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
    });
  } catch (err: any) {
    console.error('Upload Error:', err);
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }
}
