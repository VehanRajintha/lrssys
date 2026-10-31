import { NextResponse } from 'next/server';
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  const records = await db.getFreshRecords();
  for (const r of records) {
    if (r.status === 'NEEDS_REVIEW') {
      await db.updateRecord(r.id, { status: 'VERIFIED', manualCorrection: true });
    }
  }
  return NextResponse.json({ message: 'All pending records marked as verified', stats: db.getStats() });
}
