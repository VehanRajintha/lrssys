import { NextResponse } from 'next/server';
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  const mergedCount = await db.deduplicateExistingRecords();
  return NextResponse.json({
    message: `Deduplication complete. Cleaned up and removed ${mergedCount} duplicate record(s).`,
    mergedCount,
    stats: db.getStats()
  });
}
