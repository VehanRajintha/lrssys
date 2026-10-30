import { NextResponse } from 'next/server';
import * as db from '@/lib/db';

export async function POST() {
  const records = db.getRecords();
  records.forEach(r => {
    if (r.status === 'NEEDS_REVIEW') {
      db.updateRecord(r.id, { status: 'VERIFIED', manualCorrection: true });
    }
  });
  return NextResponse.json({ message: 'All pending records marked as verified', stats: db.getStats() });
}
