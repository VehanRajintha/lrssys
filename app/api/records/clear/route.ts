import { NextResponse } from 'next/server';
import * as db from '@/lib/db';
import queue from '@/lib/queue';

export async function POST() {
  await db.clearAllRecords();
  queue.resetStats();
  return NextResponse.json({ message: 'All records cleared', stats: db.getStats() });
}
