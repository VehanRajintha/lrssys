const ExcelJS = require('exceljs');

/**
 * Generate formatted Excel Workbook containing ONLY requested target fields:
 * - Counter Stamp (000xxxx) [Ascending Order]
 * - Customs Ref No
 * - Date
 * - Consignee (Importer)
 * - Declarant Name
 * 
 * @param {Array} records - Array of extracted records
 * @param {Object} options - Export options
 * @returns {Promise<Buffer>} - Buffer of the .xlsx file
 */
async function generateCusDecExcel(records, options = {}) {
  // Sort records strictly by Counter Stamp (000xxxx) in ASCENDING ORDER
  const sortedRecords = [...records].sort((a, b) => {
    const numA = parseInt(String(a.greenStampNumber || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.greenStampNumber || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) {
      return numA - numB;
    }
    return String(a.greenStampNumber || '').localeCompare(String(b.greenStampNumber || ''));
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LRSYS Customs System';
  workbook.lastModifiedBy = 'LRSYS Customs System';
  workbook.created = new Date();
  workbook.modified = new Date();

  // MAIN DATA SHEET
  const worksheet = workbook.addWorksheet('Customs Declarations', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
  });

  // Title Banner across columns A to F (6 columns)
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'SRI LANKA CUSTOMS (CUSDEC) DECLARATIONS';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' } // Deep Navy / Slate
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 32;

  // Metadata Sub-banner
  worksheet.mergeCells('A2:F2');
  const metaCell = worksheet.getCell('A2');
  metaCell.value = `Exported: ${new Date().toLocaleDateString('en-GB')}  |  Total Entries: ${sortedRecords.length}  |  Order: Counter Stamp (Ascending)`;
  metaCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFE2E8F0' } };
  metaCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }
  };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 18;

  // Spacer row
  worksheet.getRow(3).height = 8;

  // The ONLY 5 requested columns (+ Seq #)
  const columns = [
    { header: '#', width: 6 },
    { header: 'Counter Stamp (000xxxx)', width: 26 },
    { header: 'Customs Ref No', width: 22 },
    { header: 'Date', width: 16 },
    { header: 'Consignee (Importer)', width: 38 },
    { header: 'Declarant Name', width: 38 }
  ];

  // Write Table Headers on Row 4
  const headerRow = worksheet.getRow(4);
  headerRow.height = 25;
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' } // Royal Blue
    };
    cell.alignment = { vertical: 'middle', horizontal: idx === 0 || idx === 1 || idx === 2 || idx === 3 ? 'center' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  });

  // Populate Data Rows starting at Row 5
  sortedRecords.forEach((record, index) => {
    const rowNum = 5 + index;
    const row = worksheet.getRow(rowNum);
    row.height = 22;
    const isEven = index % 2 === 0;
    const bgZebra = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    // 1. #
    const cSeq = row.getCell(1);
    cSeq.value = index + 1;
    cSeq.alignment = { horizontal: 'center', vertical: 'middle' };

    // 2. Counter Stamp (000xxxx) - Strict Text Format @ to preserve leading zeros
    const cStamp = row.getCell(2);
    const stampVal = String(record.greenStampNumber || '000000').padStart(6, '0');
    cStamp.value = stampVal;
    cStamp.numFmt = '@'; // Force text format in Excel
    cStamp.font = { name: 'Consolas', size: 11, bold: true, color: { argb: 'FF047857' } }; // Distinct Emerald Green
    cStamp.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFECFDF5' } // Mint Green cell background
    };
    cStamp.alignment = { horizontal: 'center', vertical: 'middle' };

    // 3. Customs Ref No
    const cRef = row.getCell(3);
    cRef.value = String(record.customsRefNumber || '');
    cRef.numFmt = '@';
    cRef.font = { name: 'Calibri', size: 11, bold: true };
    cRef.alignment = { horizontal: 'center', vertical: 'middle' };

    // 4. Date
    const cDate = row.getCell(4);
    cDate.value = record.customsDate || '';
    cDate.alignment = { horizontal: 'center', vertical: 'middle' };

    // 5. Consignee (Importer)
    const cConsignee = row.getCell(5);
    cConsignee.value = record.consigneeName || '';
    cConsignee.font = { name: 'Calibri', size: 11, bold: true };
    cConsignee.alignment = { horizontal: 'left', vertical: 'middle' };

    // 6. Declarant Name
    const cDeclarant = row.getCell(6);
    cDeclarant.value = record.declarantName || 'NOT SPECIFIED';
    cDeclarant.font = { name: 'Calibri', size: 11 };
    cDeclarant.alignment = { horizontal: 'left', vertical: 'middle' };

    // Apply baseline borders and zebra fill
    for (let colIdx = 1; colIdx <= 6; colIdx++) {
      const cell = row.getCell(colIdx);
      if (colIdx !== 2) { // don't override counter stamp's highlight
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

  // Column Widths
  columns.forEach((col, idx) => {
    worksheet.getColumn(idx + 1).width = col.width;
  });

  // Enable AutoFilter
  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columns.length }
  };

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateCusDecExcel
};
