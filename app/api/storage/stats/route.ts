import { NextRequest, NextResponse } from 'next/server';
import { getStorageStats } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1' || searchParams.get('refresh') === '1';
    const stats = await getStorageStats(force);
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
