import { NextResponse } from 'next/server';
import queue from '@/lib/queue';

export async function POST() {
  queue.resume();
  return NextResponse.json({ message: 'Queue resumed', status: queue.getStatus() });
}
