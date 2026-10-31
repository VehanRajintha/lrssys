import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

export async function GET() {
  await db.initSupabaseSync();
  return NextResponse.json(db.getSettings());
}

export async function POST(request: NextRequest) {
  const updates = await request.json();
  const updated = db.updateSettings(updates);
  return NextResponse.json({ message: 'Settings saved', settings: updated });
}
