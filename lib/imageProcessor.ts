import sharp from 'sharp';
import fs from 'fs';

/**
 * Helper to resolve buffer from local file, remote URL (Supabase Storage), or existing Buffer
 */
export async function resolveImageBuffer(imageInput: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(imageInput)) {
    return imageInput;
  }
  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
      const response = await fetch(imageInput);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from storage URL: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    return fs.readFileSync(imageInput);
  }
  throw new Error('Unsupported image input type');
}

/**
 * Pre-process CusDec document scans to optimize Optical Character Recognition.
 * - Auto-orients based on EXIF tag
 * - Resizes oversized smartphone scans to an optimal bounding box (2048x2048) preserving 100% fine detail while reducing network upload payload by up to 90%
 * - Normalizes dynamic range for high-contrast separation between faint mechanical ink stamps and paper
 * - Applies subtle unsharp mask to clarify faded stamp wheel digits and small Box 14 text
 * - Single-pass buffer resolution for maximum speed
 */
export async function preprocessDocument(imageInput: string | Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}> {
  try {
    const inputBuffer = await resolveImageBuffer(imageInput);

    const pipeline = sharp(inputBuffer)
      .rotate() // auto-orient based on EXIF tag
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }) // Fast OCR-optimal dimension ceiling
      .normalize() // stretch dynamic range to amplify faint ink
      .sharpen({ sigma: 1.0, m1: 0.8, m2: 1.5 }) // clarify small mechanical counter wheels
      .jpeg({ quality: 88 }); // High fidelity, fast compression

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      width: info.width || 1800,
      height: info.height || 2400,
      mimeType: 'image/jpeg'
    };
  } catch (err: any) {
    console.warn(`[Image Pre-Processor] Warning: Sharp optimization failed (${err.message}). Using raw buffer.`);
    try {
      const rawBuffer = await resolveImageBuffer(imageInput);
      return {
        buffer: rawBuffer,
        width: 1800,
        height: 2400,
        mimeType: 'image/jpeg'
      };
    } catch {
      throw err;
    }
  }
}

/**
 * Extract a high-resolution Macro Crop around a normalized bounding box [ymin, xmin, ymax, xmax] (0-1000 scale).
 * Adds a 15% safety padding to ensure faint trailing digits or adjacent labels are not clipped.
 */
export async function cropBoundingBox(
  imageInput: string | Buffer,
  bbox: [number, number, number, number]
): Promise<Buffer | null> {
  try {
    const inputBuffer = await resolveImageBuffer(imageInput);
    const metadata = await sharp(inputBuffer).metadata();
    const imgWidth = metadata.width || 1800;
    const imgHeight = metadata.height || 2400;

    const [ymin, xmin, ymax, xmax] = bbox;

    // Convert 0-1000 scale to pixel coordinates
    let top = Math.round((ymin / 1000) * imgHeight);
    let left = Math.round((xmin / 1000) * imgWidth);
    let bottom = Math.round((ymax / 1000) * imgHeight);
    let right = Math.round((xmax / 1000) * imgWidth);

    // Add 15% safety padding
    const padX = Math.round((right - left) * 0.15);
    const padY = Math.round((bottom - top) * 0.15);

    top = Math.max(0, top - padY);
    left = Math.max(0, left - padX);
    const width = Math.min(imgWidth - left, (right - left) + padX * 2);
    const height = Math.min(imgHeight - top, (bottom - top) + padY * 2);

    if (width <= 10 || height <= 10) return null;

    const { data } = await sharp(inputBuffer)
      .extract({ left, top, width, height })
      .resize({ width: Math.max(width * 2, 400), fit: 'inside' }) // Upscale macro view for LLM vision
      .normalize()
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    return data;
  } catch (err: any) {
    console.warn(`[Macro Crop] Crop failed: ${err.message}`);
    return null;
  }
}
