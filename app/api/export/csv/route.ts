import { NextResponse } from 'next/server';
import * as db from '@/lib/db';
import { generateCusDecCsv } from '@/lib/excelGenerator';

export async function GET() {
  const records = db.getRecords();
  if (records.length === 0) {
    return new NextResponse('No records available to export.', { status: 400 });
  }

  const csvContent = generateCusDecCsv(records);
  const filename = `CusDec_Export_${Date.now()}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
