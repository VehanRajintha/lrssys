import { NextResponse } from 'next/server';
import * as db from '@/lib/db';

export async function POST() {
  const mergedCount = db.deduplicateExistingRecords();
  return NextResponse.json({
    message: `Deduplication complete. Cleaned up and merged ${mergedCount} duplicate record(s).`,
    mergedCount,
    stats: db.getStats()
  });
}
