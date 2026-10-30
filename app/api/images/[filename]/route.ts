import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const SAMPLES_DIR = path.join(process.cwd(), 'samples');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const rawFilename = (await params).filename;
  // Security fix: sanitize filename to prevent directory traversal attacks
  const filename = path.basename(decodeURIComponent(rawFilename));

  const inUploads = path.join(UPLOADS_DIR, filename);
  const inSamples = path.join(SAMPLES_DIR, filename);

  let targetPath = '';
  if (fs.existsSync(inUploads)) {
    targetPath = inUploads;
  } else if (fs.existsSync(inSamples)) {
    targetPath = inSamples;
  } else {
    // Check if filename without timestamp matches a sample
    if (fs.existsSync(SAMPLES_DIR)) {
      const sampleFiles = fs.readdirSync(SAMPLES_DIR);
      const matched = sampleFiles.find(f =>
        f.toLowerCase().includes(filename.toLowerCase()) ||
        filename.toLowerCase().includes(f.toLowerCase())
      );
      if (matched) {
        targetPath = path.join(SAMPLES_DIR, matched);
      }
    }
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    return NextResponse.json({ error: 'Image file not found' }, { status: 404 });
  }

  const ext = path.extname(targetPath).toLowerCase();
  let contentType = 'image/jpeg';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.pdf') contentType = 'application/pdf';

  const fileBuffer = fs.readFileSync(targetPath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200'
    }
  });
}
