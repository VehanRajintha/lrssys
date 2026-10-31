import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import queue from '@/lib/queue';
import { uploadDocumentFile } from '@/lib/storage';

const SAMPLES_DIR = path.join(process.cwd(), 'samples');

export async function POST() {
  const samplePath = path.join(SAMPLES_DIR, 'cusdec_sample_000073.jpg');
  if (!fs.existsSync(samplePath)) {
    return NextResponse.json({ error: 'Sample image not found in server.' }, { status: 404 });
  }

  const destName = `sample_${Date.now()}_cusdec_sample_000073.jpg`;
  const sampleBuf = fs.readFileSync(samplePath);
  const stored = await uploadDocumentFile(sampleBuf, destName, 'image/jpeg');

  queue.enqueue([{
    filePath: stored.isCloud ? stored.publicUrl : stored.storagePath,
    imageUrl: stored.publicUrl,
    originalName: 'cusdec_sample_000073.jpg'
  }]);

  return NextResponse.json({
    message: 'Sample CusDec document enqueued for extraction.',
    filename: destName,
    status: queue.getStatus()
  });
}
