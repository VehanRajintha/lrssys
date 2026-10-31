import { NextRequest, NextResponse } from 'next/server';
import { purgeStorageFiles, getStorageStats } from '@/lib/storage';
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action === 'orphans' ? 'orphans' : 'all';

    // Retrieve active filenames from ledger records
    const records = db.getRecords();
    const activeFilenames = records.map(r => r.filename).filter(Boolean);

    const result = await purgeStorageFiles(action, activeFilenames);
    const newStats = await getStorageStats();

    return NextResponse.json({
      ...result,
      stats: newStats
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
