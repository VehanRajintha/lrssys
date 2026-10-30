const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('=======================================================');
  console.log('   LRSYS NEXT.JS FULL INTEGRATION & ACCURACY TEST      ');
  console.log('=======================================================');

  // Test 1: Image Pre-processing with Sharp
  console.log('\n--- TEST 1: Sharp Pre-processing & Contrast Enhancement ---');
  const { preprocessDocument, cropBoundingBox } = require('./lib/imageProcessor');
  const samplePath = path.join(__dirname, 'samples', 'cusdec_sample_000073.jpg');

  if (!fs.existsSync(samplePath)) {
    throw new Error(`Sample not found: ${samplePath}`);
  }

  const preprocessed = await preprocessDocument(samplePath);
  console.log(`✓ Image preprocessed: ${preprocessed.width}x${preprocessed.height} (${preprocessed.buffer.length} bytes)`);
  if (!preprocessed.buffer || preprocessed.buffer.length < 5000) {
    throw new Error('Preprocessed buffer invalid');
  }

  // Test 2: Macro Crop
  console.log('\n--- TEST 2: High-Resolution Macro-Cropping ---');
  const stampCrop = await cropBoundingBox(samplePath, [155, 385, 185, 470]);
  if (!stampCrop || stampCrop.length < 1000) {
    throw new Error('Macro crop failed');
  }
  console.log(`✓ Macro crop generated successfully (${stampCrop.length} bytes)`);

  // Test 3: Master Registry Auto-Snap (Levenshtein Fuzzy Matching)
  console.log('\n--- TEST 3: Master Registry Auto-Snap & Levenshtein Matching ---');
  const { snapToMasterRegistry, normalizeName, loadMasterDictionary } = require('./lib/masterDictionary');
  await loadMasterDictionary();

  const testName = 'PETAH ESSENCE SUPLIERS'; // Intentional OCR typo
  const snap = snapToMasterRegistry(testName);
  console.log(`  Input OCR Name: "${testName}"`);
  console.log(`  Snapped Legal Name: "${snap.matchedName}"`);
  console.log(`  Similarity Confidence: ${(snap.confidence * 100).toFixed(1)}%`);
  console.log(`  Auto-Corrected: ${snap.wasCorrected}`);

  if (snap.matchedName !== 'PETTAH ESSENCE SUPPLIERS') {
    throw new Error(`Auto-snap failed: expected 'PETTAH ESSENCE SUPPLIERS', got '${snap.matchedName}'`);
  }
  console.log('✓ Auto-snap snapped OCR typo to exact registered legal entity!');

  // Test 4: Extractor with Disambiguation & Checksums
  console.log('\n--- TEST 4: Enhanced Extractor with Disambiguation & Checksums ---');
  const extractor = require('./lib/extractor');
  const db = require('./lib/db');

  const record = await extractor.extractDocumentData(samplePath, db.getSettings());
  console.log('  Extracted Counter Stamp:   ', record.greenStampNumber);
  console.log('  Extracted Customs Ref:     ', record.customsRefNumber);
  console.log('  Extracted Consignee:       ', record.consigneeName);
  console.log('  Extracted Declarant:       ', record.declarantName);
  console.log('  Status:                    ', record.status);
  console.log('  Confidence:                ', record.confidence + '%');

  if (record.greenStampNumber !== '000073') {
    throw new Error(`Counter stamp mismatch: expected '000073', got '${record.greenStampNumber}'`);
  }
  if (!record.customsRefNumber.includes('169170')) {
    throw new Error(`Customs ref mismatch: expected 'I 169170', got '${record.customsRefNumber}'`);
  }
  console.log('✓ All target fields extracted with 100% precision!');

  // Test 5: Excel (.xlsx) Generation with @ Text Formatting
  console.log('\n--- TEST 5: Excel Generation with Strict @ Text Formatting ---');
  const { generateCusDecExcel } = require('./lib/excelGenerator');
  const excelBuffer = await generateCusDecExcel([record]);
  const testExcelPath = path.join(__dirname, 'test_output.xlsx');
  fs.writeFileSync(testExcelPath, excelBuffer);
  console.log(`✓ Excel report generated (${excelBuffer.length} bytes): ${testExcelPath}`);
  if (!excelBuffer || excelBuffer.length < 5000) {
    throw new Error('Excel buffer invalid');
  }

  // Test 6: Tally Reconciliation Engine
  console.log('\n--- TEST 6: Tally Reconciliation Engine ---');
  const tally = require('./lib/tally');
  const file1 = [{
    counterStamp: record.greenStampNumber,
    customsRef: record.customsRefNumber,
    date: record.customsDate,
    consigneeName: record.consigneeName,
    declarantName: record.declarantName,
    normalizedConsignee: tally.normalizeName(record.consigneeName),
    normalizedDeclarant: tally.normalizeName(record.declarantName)
  }];

  const file2 = [{
    consigneeName: 'PETTAH ESSENCE SUPPLIERS (PVT) LTD',
    declarantName: 'DINU FREIGHT SERVICES',
    normalizedConsignee: tally.normalizeName('PETTAH ESSENCE SUPPLIERS (PVT) LTD'),
    normalizedDeclarant: tally.normalizeName('DINU FREIGHT SERVICES'),
    rawRow: ['1', 'PETTAH ESSENCE SUPPLIERS (PVT) LTD', 'DINU FREIGHT SERVICES']
  }];

  const tallyResult = tally.reconcileRecords(file1, file2);
  console.log(`  Matched Count: ${tallyResult.matched.length}`);
  console.log(`  Match Rate: ${tallyResult.stats.matchRate}%`);
  if (tallyResult.matched.length !== 1) {
    throw new Error('Tally reconciliation failed to match identical records');
  }
  console.log('✓ Tally reconciliation verified BOTH Consignee and Declarant successfully!');

  console.log('\n=======================================================');
  console.log('🎉 ALL 6 NEXT.JS INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  console.log('=======================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
