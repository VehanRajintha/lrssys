import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const ids = body.ids;
  if (!ids || !Array.isArray(ids)) {
    return NextResponse.json({ error: 'Array of ids is required' }, { status: 400 });
  }
  const count = db.deleteRecords(ids);
  return NextResponse.json({ message: `Deleted ${count} records`, count, stats: db.getStats() });
}
