import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  let records = await db.getFreshRecords();

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
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    }
  });
}

export async function DELETE() {
  await db.clearAllRecords();
  return NextResponse.json({ message: 'All records cleared', stats: db.getStats() }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
