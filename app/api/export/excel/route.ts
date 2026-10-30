import { NextResponse } from 'next/server';
import * as db from '@/lib/db';
import { generateCusDecExcel } from '@/lib/excelGenerator';

export async function GET() {
  try {
    const records = db.getRecords();
    if (records.length === 0) {
      return new NextResponse('No records available to export.', { status: 400 });
    }

    const buffer = await generateCusDecExcel(records);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `CusDec_Extracted_Report_${dateStr}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (err: any) {
    console.error('Excel Export Error:', err);
    return NextResponse.json({ error: `Excel generation failed: ${err.message}` }, { status: 500 });
  }
}
