import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';
import * as tally from '@/lib/tally';
import { TallyRecord, TallyResult } from '@/lib/types';

// In-memory cache for latest tally reconciliation result
let latestTally: TallyResult | null = (globalThis as any).__latestTally || null;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    let file1Records: TallyRecord[] = [];

    const file1 = formData.get('file1') as File | null;
    const file2 = formData.get('file2') as File | null;

    // If file1 is provided as an uploaded Excel or CSV file, parse it
    if (file1 && file1.name) {
      const buffer = Buffer.from(await file1.arrayBuffer());
      file1Records = await tally.parseFileBuffer(buffer, file1.name);
    } else {
      // Default: Use active extracted declarations from system DB
      const dbRecs = db.getRecords();
      file1Records = dbRecs.map((r, i) => ({
        rowIndex: i + 1,
        counterStamp: r.greenStampNumber,
        customsRef: r.customsRefNumber,
        date: r.customsDate,
        consigneeName: r.consigneeName,
        declarantName: r.declarantName,
        normalizedConsignee: tally.normalizeName(r.consigneeName),
        normalizedDeclarant: tally.normalizeName(r.declarantName)
      }));
    }

    if (!file2 || !file2.name) {
      return NextResponse.json({ error: 'Master reference file (File 2) is required.' }, { status: 400 });
    }

    const file2Buffer = Buffer.from(await file2.arrayBuffer());
    const file2Records = await tally.parseFileBuffer(file2Buffer, file2.name);

    if (file1Records.length === 0) {
      return NextResponse.json({ error: 'Source File 1 contains no declarations to compare.' }, { status: 400 });
    }
    if (file2Records.length === 0) {
      return NextResponse.json({ error: 'Master File 2 contains no recognizable data rows.' }, { status: 400 });
    }

    // Run Reconciliation: BOTH Consignee and Declarant must match
    const result = tally.reconcileRecords(file1Records, file2Records);
    latestTally = result;
    (globalThis as any).__latestTally = result;

    return NextResponse.json({
      message: 'Tally reconciliation completed successfully.',
      ...result
    });
  } catch (err: any) {
    console.error('Tally Reconciliation Error:', err);
    return NextResponse.json({ error: `Tally failed: ${err.message}` }, { status: 500 });
  }
}

export async function GET() {
  const current = (globalThis as any).__latestTally || latestTally;
  if (!current) {
    return NextResponse.json({ error: 'No tally run yet.' }, { status: 404 });
  }
  return NextResponse.json(current);
}
