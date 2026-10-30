import { NextResponse } from 'next/server';
import queue from '@/lib/queue';

export async function POST() {
  queue.pause();
  return NextResponse.json({ message: 'Queue paused', status: queue.getStatus() });
}
