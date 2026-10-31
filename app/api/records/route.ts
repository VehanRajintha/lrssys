import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  await db.initSupabaseSync();
  let records = db.getRecords();

  if (status && status !== 'ALL') {
    records = records.filter(r => r.status === status);
  }

  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r =>
      (r.greenStampNumber && r.greenStampNumber.toLowerCase().includes(q)) ||
      (r.customsRefNumber && r.customsRefNumber.toLowerCase().includes(q)) ||
      (r.consigneeName && r.consigneeName.toLowerCase().includes(q)) ||
      (r.declarantName && r.declarantName.toLowerCase().includes(q)) ||
      (r.blNumber && r.blNumber.toLowerCase().includes(q))
    );
  }

  return NextResponse.json({
    records,
    stats: db.getStats()
  });
}

export async function DELETE() {
  await db.clearAllRecords();
  return NextResponse.json({ message: 'All records cleared', stats: db.getStats() });
}
