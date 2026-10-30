import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import queue from '@/lib/queue';

const SAMPLES_DIR = path.join(process.cwd(), 'samples');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export async function POST() {
  const samplePath = path.join(SAMPLES_DIR, 'cusdec_sample_000073.jpg');
  if (!fs.existsSync(samplePath)) {
    return NextResponse.json({ error: 'Sample image not found in server.' }, { status: 404 });
  }

  const destName = `sample_${Date.now()}_cusdec_sample_000073.jpg`;
  const destPath = path.join(UPLOADS_DIR, destName);
  fs.copyFileSync(samplePath, destPath);

  queue.enqueue([{
    filePath: destPath,
    originalName: 'cusdec_sample_000073.jpg'
  }]);

  return NextResponse.json({
    message: 'Sample CusDec document enqueued for extraction.',
    filename: destName,
    status: queue.getStatus()
  });
}
