import { NextResponse } from 'next/server';
import queue from '@/lib/queue';

export async function POST() {
  queue.cancelAll();
  return NextResponse.json({ message: 'Queue cancelled', status: queue.getStatus() });
}
