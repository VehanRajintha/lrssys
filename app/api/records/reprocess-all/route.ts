import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as db from '@/lib/db';
import queue from '@/lib/queue';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST() {
  db.clearAllRecords();
  queue.resetStats();

  if (!fs.existsSync(UPLOADS_DIR)) {
    return NextResponse.json({ error: 'Uploads directory not found' }, { status: 400 });
  }

  const files = fs.readdirSync(UPLOADS_DIR);
  const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const toProcess: Array<{ filePath: string; originalName: string }> = [];

  const seenSizes = new Set<string>();
  files.forEach(f => {
    const fullPath = path.join(UPLOADS_DIR, f);
    const ext = path.extname(f).toLowerCase();
    if (validExts.includes(ext) && fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      const key = `${stat.size}_${f.slice(f.indexOf('WhatsApp') > -1 ? f.indexOf('WhatsApp') : 0)}`;
      if (!seenSizes.has(key)) {
        seenSizes.add(key);
        toProcess.push({
          filePath: fullPath,
          originalName: f
        });
      }
    }
  });

  if (toProcess.length === 0) {
    return NextResponse.json({ error: 'No uploaded images found to reprocess.' }, { status: 400 });
  }

  queue.enqueue(toProcess);

  return NextResponse.json({
    message: `Enqueued ${toProcess.length} images for AI re-processing.`,
    count: toProcess.length,
    status: queue.getStatus()
  });
}
