import { NextResponse } from 'next/server';
import queue from '@/lib/queue';
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  await db.initSupabaseSync();
  return NextResponse.json({
    queue: queue.getStatus(),
    stats: db.getStats()
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}
