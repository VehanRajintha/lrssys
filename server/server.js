const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const db = require('./db');
const queue = require('./queue');
const excelGenerator = require('./excelGenerator');
const tally = require('./tally');

const app = express();
const PORT = process.env.PORT || 5000;

// In-memory cache for latest tally reconciliation result
let latestTally = null;

// Directories
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const SAMPLES_DIR = path.join(__dirname, '..', 'samples');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(SAMPLES_DIR)) fs.mkdirSync(SAMPLES_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${basename}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB per file
});

// Helper: Get LAN IPv4 addresses for mobile access
function getLanIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ interface: name, address: iface.address });
      }
    }
  }
  return addresses;
}

// -------------------------------------------------------------
// ROUTES: IMAGES
// -------------------------------------------------------------
app.get('/api/images/:filename', (req, res) => {
  const filename = req.params.filename;
  const inUploads = path.join(UPLOADS_DIR, filename);
  const inSamples = path.join(SAMPLES_DIR, filename);

  if (fs.existsSync(inUploads)) {
    return res.sendFile(inUploads);
  } else if (fs.existsSync(inSamples)) {
    return res.sendFile(inSamples);
  } else {
    // Check if filename without timestamp matches a sample
    const sampleFiles = fs.readdirSync(SAMPLES_DIR);
    const matched = sampleFiles.find(f => f.toLowerCase().includes(filename.toLowerCase()) || filename.toLowerCase().includes(f.toLowerCase()));
    if (matched) {
      return res.sendFile(path.join(SAMPLES_DIR, matched));
    }
    return res.status(404).json({ error: 'Image file not found' });
  }
});

// -------------------------------------------------------------
// ROUTES: UPLOAD (Single / Multiple / Camera)
// -------------------------------------------------------------
app.post('/api/upload', upload.array('documents', 200), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files were uploaded.' });
  }

  const enqueuedFiles = req.files.map(file => {
    let fileHash = null;
    try {
      const buf = fs.readFileSync(file.path);
      fileHash = crypto.createHash('md5').update(buf).digest('hex');
    } catch (e) {}

    return {
      filePath: file.path,
      originalName: file.originalname,
      fileHash: fileHash
    };
  });

  queue.enqueue(enqueuedFiles);

  res.json({
    message: `Successfully enqueued ${enqueuedFiles.length} file(s). Duplicate uploads will auto-merge.`,
    count: enqueuedFiles.length,
    status: queue.getStatus()
  });
});

// -------------------------------------------------------------
// ROUTES: BULK ZIP UPLOAD (Thousands of files)
// -------------------------------------------------------------
app.post('/api/upload-zip', upload.single('zipfile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No ZIP archive uploaded.' });
  }

  try {
    const zip = new AdmZip(req.file.path);
    const zipEntries = zip.getEntries();
    const extractedFiles = [];

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

    zipEntries.forEach(entry => {
      if (!entry.isDirectory) {
        const ext = path.extname(entry.entryName).toLowerCase();
        if (allowedExtensions.includes(ext)) {
          const cleanName = path.basename(entry.entryName);
          const dataBuf = entry.getData();
          const fileHash = crypto.createHash('md5').update(dataBuf).digest('hex');
          const destPath = path.join(UPLOADS_DIR, `zip_${Date.now()}_${cleanName}`);
          fs.writeFileSync(destPath, dataBuf);
          extractedFiles.push({
            filePath: destPath,
            originalName: cleanName,
            fileHash: fileHash
          });
        }
      }
    });

    // Remove the temporary uploaded zip
    fs.unlinkSync(req.file.path);

    if (extractedFiles.length === 0) {
      return res.status(400).json({ error: 'No valid image files found inside the ZIP archive.' });
    }

    queue.enqueue(extractedFiles);

    res.json({
      message: `Unzipped and enqueued ${extractedFiles.length} images from archive. Duplicate declarations will auto-merge cleanly.`,
      count: extractedFiles.length,
      status: queue.getStatus()
    });
  } catch (err) {
    console.error('ZIP extraction error:', err);
    res.status(500).json({ error: `Failed to process ZIP archive: ${err.message}` });
  }
});

// -------------------------------------------------------------
// ROUTES: DEMO / TEST SAMPLE
// -------------------------------------------------------------
app.post('/api/demo/load-sample', (req, res) => {
  const samplePath = path.join(SAMPLES_DIR, 'cusdec_sample_000073.jpg');
  if (!fs.existsSync(samplePath)) {
    return res.status(404).json({ error: 'Sample image not found in server.' });
  }

  // Copy sample to uploads
  const destName = `sample_${Date.now()}_cusdec_sample_000073.jpg`;
  const destPath = path.join(UPLOADS_DIR, destName);
  fs.copyFileSync(samplePath, destPath);

  queue.enqueue([{
    filePath: destPath,
    originalName: 'cusdec_sample_000073.jpg'
  }]);

  res.json({
    message: 'Sample CusDec document enqueued for extraction.',
    filename: destName,
    status: queue.getStatus()
  });
});

// -------------------------------------------------------------
// ROUTES: RECORDS MANAGEMENT & CORRECTION
// -------------------------------------------------------------
app.get('/api/records', (req, res) => {
  const { status, search } = req.query;
  let records = db.getRecords();

  if (status && status !== 'ALL') {
    records = records.filter(r => r.status === status);
  }

  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r =>
      (r.greenStampNumber && r.greenStampNumber.toLowerCase().includes(q)) ||
      (r.customsRefNumber && r.customsRefNumber.toLowerCase().includes(q)) ||
      (r.consigneeName && r.consigneeName.toLowerCase().includes(q)) ||
      (r.declarantName && r.declarantName.toLowerCase().includes(q)) ||
      (r.blNumber && r.blNumber.toLowerCase().includes(q))
    );
  }

  res.json({
    records,
    stats: db.getStats()
  });
});

app.get('/api/records/:id', (req, res) => {
  const record = db.getRecordById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found' });
  res.json(record);
});

// In-place correction of fields (100% Accuracy Workflow)
app.put('/api/records/:id', (req, res) => {
  const id = req.params.id;
  const updates = req.body;
  const updated = db.updateRecord(id, updates);
  if (!updated) return res.status(404).json({ error: 'Record not found' });
  res.json({ message: 'Record updated successfully', record: updated });
});

app.delete('/api/records/:id', (req, res) => {
  const deleted = db.deleteRecord(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Record not found' });
  res.json({ message: 'Record deleted', stats: db.getStats() });
});

// Bulk Delete Records
app.post('/api/records/delete-bulk', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Array of ids is required' });
  }
  const count = db.deleteRecords(ids);
  res.json({ message: `Deleted ${count} records`, count, stats: db.getStats() });
});

// Clean & Auto-merge duplicate declarations on demand
app.post('/api/records/deduplicate', (req, res) => {
  const mergedCount = db.deduplicateExistingRecords();
  res.json({
    message: `Deduplication complete. Cleaned up and merged ${mergedCount} duplicate record(s).`,
    mergedCount,
    stats: db.getStats()
  });
});

// Reprocess all uploaded images with the updated AI settings
app.post('/api/records/reprocess-all', (req, res) => {
  db.clearAllRecords();
  queue.resetStats();

  const files = fs.readdirSync(UPLOADS_DIR);
  const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const toProcess = [];

  // Group unique images (ignore duplicates from prior unzips if same name)
  const seenSizes = new Set();
  files.forEach(f => {
    const fullPath = path.join(UPLOADS_DIR, f);
    const ext = path.extname(f).toLowerCase();
    if (validExts.includes(ext) && fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      // Skip exact duplicate size/base
      const key = `${stat.size}_${f.slice(f.indexOf('WhatsApp') > -1 ? f.indexOf('WhatsApp') : 0)}`;
      if (!seenSizes.has(key)) {
        seenSizes.add(key);
        toProcess.push({
          filePath: fullPath,
          originalName: f
        });
      }
    }
  });

  if (toProcess.length === 0) {
    return res.status(400).json({ error: 'No uploaded images found to reprocess.' });
  }

  queue.enqueue(toProcess);

  res.json({
    message: `Enqueued ${toProcess.length} images for AI re-processing.`,
    count: toProcess.length,
    status: queue.getStatus()
  });
});

app.post('/api/records/clear', (req, res) => {
  db.clearAllRecords();
  queue.resetStats();
  res.json({ message: 'All records cleared', stats: db.getStats() });
});

app.post('/api/records/verify-all', (req, res) => {
  const records = db.getRecords();
  records.forEach(r => {
    if (r.status === 'NEEDS_REVIEW') {
      db.updateRecord(r.id, { status: 'VERIFIED', manualCorrection: true });
    }
  });
  res.json({ message: 'All pending records marked as verified', stats: db.getStats() });
});

// -------------------------------------------------------------
// ROUTES: QUEUE CONTROLS
// -------------------------------------------------------------
app.get('/api/queue/status', (req, res) => {
  res.json({
    queue: queue.getStatus(),
    stats: db.getStats()
  });
});

app.post('/api/queue/pause', (req, res) => {
  queue.pause();
  res.json({ message: 'Queue paused', status: queue.getStatus() });
});

app.post('/api/queue/resume', (req, res) => {
  queue.resume();
  res.json({ message: 'Queue resumed', status: queue.getStatus() });
});

app.post('/api/queue/cancel', (req, res) => {
  queue.cancelAll();
  res.json({ message: 'Queue cancelled', status: queue.getStatus() });
});

// -------------------------------------------------------------
// ROUTES: EXCEL & CSV EXPORT
// -------------------------------------------------------------
app.get('/api/export/excel', async (req, res) => {
  try {
    const records = db.getRecords();
    if (records.length === 0) {
      return res.status(400).send('No records available to export.');
    }

    const buffer = await excelGenerator.generateCusDecExcel(records);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `CusDec_Extracted_Report_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('Excel Export Error:', err);
    res.status(500).json({ error: `Excel generation failed: ${err.message}` });
  }
});

app.get('/api/export/csv', (req, res) => {
  let records = db.getRecords();
  if (records.length === 0) return res.status(400).send('No records available.');

  // Sort ascending by Counter Stamp
  records = [...records].sort((a, b) => {
    const numA = parseInt(String(a.greenStampNumber || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.greenStampNumber || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.greenStampNumber || '').localeCompare(String(b.greenStampNumber || ''));
  });

  const headers = [
    '#',
    'Counter_Stamp',
    'Customs_Ref_No',
    'Date',
    'Consignee_Importer',
    'Declarant_Name'
  ];

  const rows = records.map((r, i) => [
    i + 1,
    `="${r.greenStampNumber || '000000'}"`,
    `"${(r.customsRefNumber || '').replace(/"/g, '""')}"`,
    `"${r.customsDate || ''}"`,
    `"${(r.consigneeName || '').replace(/"/g, '""')}"`,
    `"${(r.declarantName || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const filename = `CusDec_Export_${Date.now()}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// -------------------------------------------------------------
// ROUTES: TALLY RECONCILIATION
// -------------------------------------------------------------
const tallyUpload = upload.fields([
  { name: 'file1', maxCount: 1 },
  { name: 'file2', maxCount: 1 }
]);

app.post('/api/tally/run', tallyUpload, async (req, res) => {
  try {
    let file1Records = [];

    // If file1 is provided as an uploaded Excel or CSV file, parse it
    if (req.files && req.files['file1'] && req.files['file1'][0]) {
      const f1 = req.files['file1'][0];
      const buffer = fs.readFileSync(f1.path);
      file1Records = await tally.parseFileBuffer(buffer, f1.originalname);
      fs.unlinkSync(f1.path); // cleanup
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

    if (!req.files || !req.files['file2'] || !req.files['file2'][0]) {
      return res.status(400).json({ error: 'Master reference file (File 2) is required.' });
    }

    const f2 = req.files['file2'][0];
    const file2Buffer = fs.readFileSync(f2.path);
    const file2Records = await tally.parseFileBuffer(file2Buffer, f2.originalname);
    fs.unlinkSync(f2.path); // cleanup

    if (file1Records.length === 0) {
      return res.status(400).json({ error: 'Source File 1 contains no declarations to compare.' });
    }
    if (file2Records.length === 0) {
      return res.status(400).json({ error: 'Master File 2 contains no recognizable data rows.' });
    }

    // Run Reconciliation: BOTH Consignee and Declarant must match!
    const result = tally.reconcileRecords(file1Records, file2Records);
    latestTally = result;

    res.json({
      message: 'Tally reconciliation completed successfully.',
      ...result
    });
  } catch (err) {
    console.error('Tally Reconciliation Error:', err);
    res.status(500).json({ error: `Tally failed: ${err.message}` });
  }
});

app.get('/api/tally/last', (req, res) => {
  if (!latestTally) {
    return res.status(404).json({ error: 'No tally run yet.' });
  }
  res.json(latestTally);
});

app.get('/api/tally/export/excel', async (req, res) => {
  try {
    if (!latestTally || !latestTally.matched || latestTally.matched.length === 0) {
      return res.status(400).send('No matched tally records available to export.');
    }

    const buffer = await tally.generateMatchedExcel(latestTally.matched);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Tally_Matched_Declarations_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('Tally Export Error:', err);
    res.status(500).json({ error: `Tally export failed: ${err.message}` });
  }
});

app.get('/api/tally/export/csv', (req, res) => {
  try {
    if (!latestTally || !latestTally.matched || latestTally.matched.length === 0) {
      return res.status(400).send('No matched tally records available to export.');
    }

    const csvContent = tally.generateMatchedCsv(latestTally.matched);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Tally_Matched_Declarations_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Tally CSV Export Error:', err);
    res.status(500).json({ error: `Tally CSV export failed: ${err.message}` });
  }
});

// -------------------------------------------------------------
// ROUTES: SETTINGS & SYSTEM INFO
// -------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json({ message: 'Settings saved', settings: updated });
});

app.get('/api/system/info', (req, res) => {
  const lanAddresses = getLanIpAddresses();
  res.json({
    serverTime: new Date().toISOString(),
    port: PORT,
    lanAddresses: lanAddresses,
    primaryLanUrl: lanAddresses.length > 0 ? `http://${lanAddresses[0].address}:${PORT}` : `http://localhost:${PORT}`,
    storageCount: db.getRecords().length,
    stats: db.getStats()
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 CusDec Bulk Extraction System is running!`);
  console.log(`🖥️  Desktop Local URL: http://localhost:${PORT}`);
  const lans = getLanIpAddresses();
  if (lans.length > 0) {
    console.log(`📱 Mobile LAN URL:    http://${lans[0].address}:${PORT}`);
  }
  console.log(`=======================================================`);
});

