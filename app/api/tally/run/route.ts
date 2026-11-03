import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';
import * as tally from '@/lib/tally';
import { TallyRecord, TallyResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

// In-memory cache for latest tally reconciliation result
let latestTally: TallyResult | null = (globalThis as any).__latestTally || null;

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wantsStream = searchParams.get('stream') === '1' || request.headers.get('accept')?.includes('application/x-ndjson');

    const formData = await request.formData();
    let file1Records: TallyRecord[] = [];

    const file1 = formData.get('file1') as File | null;
    const file2 = formData.get('file2') as File | null;

    if (!wantsStream) {
      // Standard Non-Streaming Flow
      if (file1 && file1.name) {
        const buffer = Buffer.from(await file1.arrayBuffer());
        file1Records = await tally.parseFileBuffer(buffer, file1.name);
      } else {
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

      const result = tally.reconcileRecords(file1Records, file2Records);
      latestTally = result;
      (globalThis as any).__latestTally = result;

      return NextResponse.json({
        message: 'Tally reconciliation completed successfully.',
        ...result
      });
    }

    // Real-Time Streaming Flow
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    const sendEvent = async (data: any) => {
      try {
        await writer.write(encoder.encode(JSON.stringify(data) + '\n'));
      } catch (e) {
        // Consumer disconnected
      }
    };

    (async () => {
      try {
        await sendEvent({
          type: 'progress',
          percent: 10,
          stage: 'Loading declaration sources...',
          current: 0,
          total: 0
        });

        if (file1 && file1.name) {
          const buffer = Buffer.from(await file1.arrayBuffer());
          file1Records = await tally.parseFileBuffer(buffer, file1.name);
        } else {
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
          await sendEvent({ type: 'error', error: 'Master reference file (File 2) is required.' });
          await writer.close();
          return;
        }

        await sendEvent({
          type: 'progress',
          percent: 25,
          stage: `Ingesting master manifest reference (${file2.name})...`,
          current: 0,
          total: file1Records.length
        });

        const file2Buffer = Buffer.from(await file2.arrayBuffer());
        const file2Records = await tally.parseFileBuffer(file2Buffer, file2.name);

        if (file1Records.length === 0) {
          await sendEvent({ type: 'error', error: 'Source File 1 contains no declarations to compare.' });
          await writer.close();
          return;
        }
        if (file2Records.length === 0) {
          await sendEvent({ type: 'error', error: 'Master File 2 contains no recognizable data rows.' });
          await writer.close();
          return;
        }

        await sendEvent({
          type: 'progress',
          percent: 35,
          stage: `Indexed ${file2Records.length} master entities. Normalizing Sri Lanka Customs acronyms...`,
          current: 0,
          total: file1Records.length
        });

        // Run reconciliation with real-time granular progress callbacks
        const result = tally.reconcileRecords(file1Records, file2Records, (p) => {
          // Scale progress smoothly from 35% to 95%
          const scaledPercent = Math.min(95, Math.round(35 + (p.percent * 0.6)));
          sendEvent({
            type: 'progress',
            percent: scaledPercent,
            stage: p.stage || `Evaluating Box 8 & Box 14: ${p.currentItem}`,
            current: p.current,
            total: p.total,
            currentItem: p.currentItem
          });
        });

        latestTally = result;
        (globalThis as any).__latestTally = result;

        await sendEvent({
          type: 'progress',
          percent: 100,
          stage: 'Finalizing tally reconciliation report...',
          current: file1Records.length,
          total: file1Records.length
        });

        await sendEvent({
          type: 'complete',
          result
        });
      } catch (err: any) {
        await sendEvent({ type: 'error', error: err.message || 'Tally failed' });
      } finally {
        await writer.close();
      }
    })();

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
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
