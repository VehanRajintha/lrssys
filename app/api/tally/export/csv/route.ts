import { NextResponse } from 'next/server';
import * as tally from '@/lib/tally';
import { TallyResult } from '@/lib/types';

export async function GET() {
  try {
    const latestTally: TallyResult | null = (globalThis as any).__latestTally || null;
    if (!latestTally || !latestTally.matched || latestTally.matched.length === 0) {
      return new NextResponse('No matched tally records available to export.', { status: 400 });
    }

    const csvContent = tally.generateMatchedCsv(latestTally.matched);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Tally_Matched_Declarations_${dateStr}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (err: any) {
    console.error('Tally CSV Export Error:', err);
    return NextResponse.json({ error: `Tally CSV export failed: ${err.message}` }, { status: 500 });
  }
}
