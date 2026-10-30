import { NextResponse } from 'next/server';
import * as tally from '@/lib/tally';
import { TallyResult } from '@/lib/types';

export async function GET() {
  try {
    const latestTally: TallyResult | null = (globalThis as any).__latestTally || null;
    if (!latestTally || !latestTally.matched || latestTally.matched.length === 0) {
      return new NextResponse('No matched tally records available to export.', { status: 400 });
    }

    const buffer = await tally.generateMatchedExcel(latestTally.matched);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Tally_Matched_Declarations_${dateStr}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (err: any) {
    console.error('Tally Export Error:', err);
    return NextResponse.json({ error: `Tally export failed: ${err.message}` }, { status: 500 });
  }
}
