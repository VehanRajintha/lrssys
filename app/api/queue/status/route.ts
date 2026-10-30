import { NextResponse } from 'next/server';
import queue from '@/lib/queue';
import * as db from '@/lib/db';

export async function GET() {
  return NextResponse.json({
    queue: queue.getStatus(),
    stats: db.getStats()
  });
}
