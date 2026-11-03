import ExcelJS from 'exceljs';
import path from 'path';
import { TallyRecord, TallyResult } from './types';
export { normalizeName, calculateSimilarity } from './masterDictionary';
import { normalizeName, calculateSimilarity } from './masterDictionary';

/**
 * Fast RFC-compliant CSV parser
 */
export function parseCsvString(text: string): string[][] {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const rows: string[][] = [];
  for (const line of lines) {
    const row: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

/**
 * Check if buffer is an XLSX file (starts with PK\x03\x04)
 */
export function isXlsxBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/**
 * Parse any uploaded file buffer (.xlsx, .xls, or .csv)
 */
export async function parseFileBuffer(buffer: Buffer, filename: string = ''): Promise<TallyRecord[]> {
  const ext = path.extname(filename).toLowerCase();
  const isXlsx = isXlsxBuffer(buffer) || ext === '.xlsx' || ext === '.xls';

  if (!isXlsx || ext === '.csv') {
    const text = buffer.toString('utf8');
    const rawRows = parseCsvString(text);
    return processRawRows(rawRows);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) return [];

  const rawRows: string[][] = [];
  worksheet.eachRow((row) => {
    const rowVals = Array.isArray(row.values) ? row.values.slice(1) : [];
    rawRows.push(rowVals.map(v => (v !== null && v !== undefined) ? String(v) : ''));
  });

  return processRawRows(rawRows);
}

/**
 * Detect column indices and convert raw rows to structured records
 */
export function processRawRows(rawRows: string[][]): TallyRecord[] {
  if (!rawRows || rawRows.length === 0) return [];

  let headerRowIndex = 0;
  let consigneeCol = -1;
  let declarantCol = -1;
  let companyCol = -1;
  let stampCol = -1;
  let refCol = -1;
  let dateCol = -1;

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toLowerCase().trim();
      if (!val) continue;

      if (val === 'consignee' || val === 'consignee name' || val === 'importer' || val === 'importer name') {
        consigneeCol = c;
      } else if (consigneeCol === -1 && (val.includes('consignee') || val.includes('importer') || val.includes('buyer') || val.includes('receiver'))) {
        consigneeCol = c;
      }

      if (val === 'declarant' || val === 'declarant name' || val === 'representative' || val === 'cha' || val === 'cha name') {
        declarantCol = c;
      } else if (declarantCol === -1 && (val.includes('declarant') || val.includes('representative') || val.includes('forwarder') || val.includes('clearing'))) {
        declarantCol = c;
      }

      if (val === 'company name' || val === 'company') {
        companyCol = c;
      } else if (companyCol === -1 && !val.includes('date') && !val.includes('no') && !val.includes('status') && (val.includes('company') || val.includes('organization') || val.includes('entity'))) {
        companyCol = c;
      }

      if (val.includes('stamp') || val.includes('counter') || val.includes('000xxxx') || val.includes('sequence')) {
        stampCol = c;
      }
      if (val.includes('customs') || val.includes('ref') || val.includes('cusdec') || val.includes('entry')) {
        refCol = c;
      }
      if (val === 'date' || val === 'cusdec date' || (val.includes('date') && !val.includes('registration'))) {
        dateCol = c;
      }
    }

    if (consigneeCol !== -1 || declarantCol !== -1 || companyCol !== -1) {
      headerRowIndex = r;
      break;
    }
  }

  if (consigneeCol === -1 && declarantCol === -1 && companyCol === -1) {
    consigneeCol = 4;
    declarantCol = 5;
    stampCol = 1;
    refCol = 2;
    dateCol = 3;
  }

  const records: TallyRecord[] = [];
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const consigneeVal = consigneeCol !== -1 ? String(row[consigneeCol] || '').trim() : '';
    const declarantVal = declarantCol !== -1 ? String(row[declarantCol] || '').trim() : '';
    const companyVal = companyCol !== -1 ? String(row[companyCol] || '').trim() : '';
    const stampVal = stampCol !== -1 ? String(row[stampCol] || '').trim() : '';
    const refVal = refCol !== -1 ? String(row[refCol] || '').trim() : '';
    const dateVal = dateCol !== -1 ? String(row[dateCol] || '').trim() : '';

    if (consigneeVal || declarantVal || companyVal || stampVal) {
      records.push({
        rowIndex: r + 1,
        counterStamp: stampVal,
        customsRef: refVal,
        date: dateVal,
        consigneeName: consigneeVal || (companyCol !== -1 ? companyVal : ''),
        declarantName: declarantVal || (companyCol !== -1 ? companyVal : ''),
        companyName: companyVal,
        normalizedConsignee: normalizeName(consigneeVal || companyVal),
        normalizedDeclarant: normalizeName(declarantVal || companyVal),
        normalizedCompany: normalizeName(companyVal),
        rawRow: row
      });
    }
  }

  return records;
}

export type TallyProgressCallback = (progress: {
  current: number;
  total: number;
  percent: number;
  currentItem?: string;
  stage?: string;
}) => void;

/**
 * Reconcile File 1 against File 2
 * MATCH CRITERIA: BOTH Consignee Name AND Declarant Name must be verified in File 2!
 */
export function reconcileRecords(
  file1Records: TallyRecord[],
  file2Records: TallyRecord[],
  onProgress?: TallyProgressCallback
): TallyResult {
  const isMasterCompanyRegistry = file2Records.some(r => r.companyName) &&
    file2Records.every(r => !r.rawRow || r.consigneeName === r.declarantName || !r.declarantName);

  const masterCompanySet = new Set<string>();
  const masterCompanyList: string[] = [];

  file2Records.forEach(r => {
    if (r.normalizedCompany) {
      masterCompanySet.add(r.normalizedCompany);
      masterCompanyList.push(r.normalizedCompany);
    }
    if (r.normalizedConsignee) {
      masterCompanySet.add(r.normalizedConsignee);
      masterCompanyList.push(r.normalizedConsignee);
    }
    if (r.normalizedDeclarant) {
      masterCompanySet.add(r.normalizedDeclarant);
      masterCompanyList.push(r.normalizedDeclarant);
    }
  });

  function companyExistsInMaster(normName: string): boolean {
    if (!normName || normName.length < 3) return false;
    if (masterCompanySet.has(normName)) return true;
    return masterCompanyList.some(m => calculateSimilarity(m, normName) >= 0.88);
  }

  const matched: TallyRecord[] = [];
  const unmatchedFile1: TallyRecord[] = [];
  const matchedFile2Indices = new Set<number>();
  const total = file1Records.length;

  for (let i = 0; i < total; i++) {
    const r1 = file1Records[i];
    let isMatch = false;
    let matchNote = '';

    if (onProgress && (i % 2 === 0 || i === total - 1)) {
      onProgress({
        current: i + 1,
        total,
        percent: Math.min(99, Math.round(((i + 1) / total) * 100)),
        currentItem: r1.consigneeName || r1.declarantName || r1.customsRef || `Declaration #${i + 1}`,
        stage: `Evaluating Box 8 & Box 14 (${i + 1}/${total})`
      });
    }

    if (isMasterCompanyRegistry) {
      const consigneeFound = companyExistsInMaster(r1.normalizedConsignee);
      const declarantFound = companyExistsInMaster(r1.normalizedDeclarant);

      if (consigneeFound && declarantFound) {
        isMatch = true;
        matchNote = 'BOTH CONSIGNEE & DECLARANT REGISTERED IN MASTER';
      }
    } else {
      const rowMatch = file2Records.find((r2, idx) => {
        if (matchedFile2Indices.has(idx)) return false;

        const cMatch = calculateSimilarity(r1.normalizedConsignee, r2.normalizedConsignee) >= 0.88;
        const dMatch = calculateSimilarity(r1.normalizedDeclarant, r2.normalizedDeclarant) >= 0.88;

        return cMatch && dMatch;
      });

      if (rowMatch) {
        isMatch = true;
        matchNote = 'EXACT ROW MATCH (BOTH NAMES)';
        matchedFile2Indices.add(file2Records.indexOf(rowMatch));
      }
    }

    if (isMatch) {
      matched.push({
        counterStamp: r1.counterStamp,
        customsRef: r1.customsRef,
        date: r1.date,
        consigneeName: r1.consigneeName,
        declarantName: r1.declarantName,
        matchNote,
        sourceRowFile1: r1.rowIndex,
        normalizedConsignee: r1.normalizedConsignee,
        normalizedDeclarant: r1.normalizedDeclarant
      });
    } else {
      unmatchedFile1.push(r1);
    }
  }

  const unmatchedFile2 = file2Records.filter((_, idx) => !matchedFile2Indices.has(idx));
  const totalF1 = file1Records.length;
  const matchCount = matched.length;
  const matchRate = totalF1 > 0 ? ((matchCount / totalF1) * 100).toFixed(1) : '0.0';

  return {
    matched,
    unmatchedFile1,
    unmatchedFile2,
    stats: {
      totalFile1: totalF1,
      totalFile2: file2Records.length,
      matchedCount: matchCount,
      unmatchedFile1Count: unmatchedFile1.length,
      unmatchedFile2Count: unmatchedFile2.length,
      matchRate: parseFloat(matchRate)
    }
  };
}

/**
 * Generate Matched Excel Workbook (.xlsx)
 */
export async function generateMatchedExcel(matchedRecords: TallyRecord[]): Promise<Buffer> {
  const sorted = [...matchedRecords].sort((a, b) => {
    const numA = parseInt(String(a.counterStamp || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.counterStamp || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.counterStamp || '').localeCompare(String(b.counterStamp || ''));
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LRSYS Customs Tally Engine';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Tally Matched Declarations', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
  });

  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'TALLY RECONCILIATION - MATCHED CUSTOMS DECLARATIONS';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells('A2:G2');
  const metaCell = worksheet.getCell('A2');
  metaCell.value = `Exported: ${new Date().toLocaleDateString('en-GB')}  |  Matched Entries: ${sorted.length}  |  Match Condition: BOTH Consignee & Declarant Name Verified`;
  metaCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFE2E8F0' } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 18;

  const columns = [
    { header: '#', width: 6 },
    { header: 'Counter Stamp (000xxxx)', width: 26 },
    { header: 'Customs Ref No', width: 22 },
    { header: 'Date', width: 16 },
    { header: 'Consignee (Importer)', width: 38 },
    { header: 'Declarant Name', width: 38 },
    { header: 'Tally Verification', width: 26 }
  ];

  const headerRow = worksheet.getRow(4);
  headerRow.height = 25;
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    cell.alignment = { vertical: 'middle', horizontal: idx <= 3 || idx === 6 ? 'center' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  });

  sorted.forEach((record, index) => {
    const rowNum = 5 + index;
    const row = worksheet.getRow(rowNum);
    row.height = 22;
    const isEven = index % 2 === 0;
    const bgZebra = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    row.getCell(1).value = index + 1;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    const cStamp = row.getCell(2);
    const stampVal = String(record.counterStamp || '000000').padStart(6, '0');
    cStamp.value = stampVal;
    cStamp.numFmt = '@';
    cStamp.font = { name: 'Consolas', size: 11, bold: true, color: { argb: 'FF047857' } };
    cStamp.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
    cStamp.alignment = { horizontal: 'center', vertical: 'middle' };

    row.getCell(3).value = record.customsRef || '';
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).numFmt = '@';

    row.getCell(4).value = record.date || '';
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

    row.getCell(5).value = record.consigneeName || '';
    row.getCell(5).font = { bold: true };

    row.getCell(6).value = record.declarantName || '';

    const cMatch = row.getCell(7);
    cMatch.value = '✓ BOTH MATCHED';
    cMatch.font = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
    cMatch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    cMatch.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      if (c !== 2 && c !== 7) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgZebra } };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }
  });

  columns.forEach((col, idx) => {
    worksheet.getColumn(idx + 1).width = col.width;
  });

  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columns.length }
  };

  const uint8Array = await workbook.xlsx.writeBuffer();
  return Buffer.from(uint8Array);
}

/**
 * Generate Matched CSV String
 */
export function generateMatchedCsv(matchedRecords: TallyRecord[]): string {
  const sorted = [...matchedRecords].sort((a, b) => {
    const numA = parseInt(String(a.counterStamp || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.counterStamp || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.counterStamp || '').localeCompare(String(b.counterStamp || ''));
  });

  const headers = ['#', 'Counter_Stamp', 'Customs_Ref_No', 'Date', 'Consignee_Importer', 'Declarant_Name', 'Tally_Status'];
  const rows = sorted.map((r, i) => [
    i + 1,
    `="${String(r.counterStamp || '000000').padStart(6, '0')}"`,
    `"${(r.customsRef || '').replace(/"/g, '""')}"`,
    `"${r.date || ''}"`,
    `"${(r.consigneeName || '').replace(/"/g, '""')}"`,
    `"${(r.declarantName || '').replace(/"/g, '""')}"`,
    '"VERIFIED (BOTH MATCHED)"'
  ]);

  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}
