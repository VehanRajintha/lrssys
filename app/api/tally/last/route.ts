import { NextResponse } from 'next/server';
import { TallyResult } from '@/lib/types';

export async function GET() {
  const current: TallyResult | null = (globalThis as any).__latestTally || null;
  if (!current) {
    return NextResponse.json({ error: 'No tally run yet.' }, { status: 404 });
  }
  return NextResponse.json(current);
}
