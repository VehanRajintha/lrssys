# LRSYS - Sri Lanka Customs (CusDec) Next.js Extraction & Audit Terminal

A modern, full-stack, enterprise-grade Next.js 15 + TypeScript application built specifically for **Sri Lanka Customs Goods Declarations (CusDec-53)**.

---

## 🌟 Key Features & Accuracy Enhancements

1. **High-Accuracy Optical & AI Pipeline**:
   - **Sharp Image Pre-Processing**: Auto-orient, CLAHE dynamic contrast stretching, and unsharp masking for faint, faded ink stamps.
   - **Two-Pass Macro-Cropping**: Automatically takes high-resolution crops around mechanical wheel counter stamps for zero-ambiguity digit identification.
   - **Wheel Character Disambiguation**: Corrects mechanical wheel OCR artifacts (`O` → `0`, `S` → `5`, `I/L` → `1`) and strictly pads to 6 digits (`000073`).
   - **CusDec Syntax & TIN Checksums**: Validates entry types and registration numbers (`^[A-Z]\s*\d{5,7}$`) and TIN length (9, 12, 13 digits).
   - **Master Registry Auto-Snap**: Uses Levenshtein distance fuzzy matching during extraction to auto-correct slight OCR typos in consignees/declarants to their exact registered legal corporate entity name.

2. **Precision Field Extraction**:
   - **Counter Stamp (`000xxxx`)**: Mechanical counter stamp (e.g. `000073`). Preserved strictly as formatted text so leading zeros are **never lost in Excel**.
   - **Customs Reference Number**: Entry type, registration number, and date (e.g. `I 169170 23/10/2026`).
   - **Consignee Name (Importer)**: Box 8 Sri Lankan consignee (e.g. `PETTAH ESSENCE SUPPLIERS`).
   - **Declarant Name**: Box 14 clearing agent / freight forwarding partner (e.g. `DINU FREIGHT SERVICES`).

3. **Dual Workspace Cockpit**:
   - **Interactive Visual Inspection Bay**: Canvas pan/zoom with mouse drag, wheel zoom, touch pinch-to-zoom, and instant quick-edit form.
   - **Extracted Cargo Ledger**: Real-time filtering, search, multi-row selection, bulk deletion, AI reprocessing, and 1-click approvals.

4. **⚖️ Tally Reconciliation Station**:
   - Cross-reconciles generated declarations against master reference registries (CSV / XLSX).
   - Match condition: **BOTH Consignee Name AND Declarant Name** must match in both files.
   - Generates formatted reconciliation Excel workbooks and CSV files sorted ascending by Counter Stamp.

5. **Professional Excel (.xlsx) & CSV Export**:
   - Formatted header banner, royal blue columns, zebra rows, and auto-filters.
   - Leading zeros strictly preserved via text format (`@`).

6. **Mobile Responsive & QR Pairing**:
   - On-site camera snapping at CFS warehouses and wharves.
   - Real-time LAN IP discovery with instant QR code generator for mobile pairing.

---

## 🚀 How to Run

### Option 1: One-Click Startup (Windows)
Double-click:
```
start.bat
```
This automatically launches the Next.js production server on port `5000` and opens your browser.

### Option 2: Command Line (Development Mode)
```powershell
npm run dev
```
Open [http://localhost:5000](http://localhost:5000).

### Option 3: Command Line (Production Build)
```powershell
npm run build
npm run start
```

### Option 4: Run Integration Tests
```powershell
npx tsx test_system_next.js
```

---

## 📁 System Architecture

```
LRSYS/
├── app/
│   ├── layout.tsx             # Root layout with theme hydration and liquid ambient mesh
│   ├── page.tsx               # Next.js interactive cockpit (OCR + Tally + Modals)
│   ├── globals.css            # iOS 27 Liquid Glass styling (dark/light themes)
│   └── api/                   # Next.js Route Handlers (25 endpoints)
│       ├── records/           # Declarations CRUD, bulk delete, verify-all, clear
│       ├── upload/            # Camera snap & multi-file upload
│       ├── upload-zip/        # Bulk ZIP archive ingestion
│       ├── demo/              # Sample 000073 demo loader
│       ├── queue/             # Concurrency queue status & controls
│       ├── images/            # Secure image serving with path traversal guard
│       ├── export/            # Formatted Excel & CSV ledger exports
│       ├── tally/             # Cross-reconciliation runner & matched exports
│       ├── settings/          # System and AI configuration
│       └── system/info/       # LAN discovery & QR code payload
├── lib/
│   ├── types.ts               # Core TypeScript interfaces
│   ├── imageProcessor.ts      # Sharp pre-processing & macro-crop engine
│   ├── masterDictionary.ts    # Levenshtein fuzzy matching & legal name auto-snap
│   ├── extractor.ts           # Gemini Vision multi-modal extractor with 2-pass pipeline
│   ├── db.ts                  # Persistent atomic JSON storage & 4-tier deduplicator
│   ├── queue.ts               # Singleton concurrency worker queue
│   ├── excelGenerator.ts      # ExcelJS workbook compiler with @ text format
│   └── tally.ts               # Reconciliation engine with dual CSV/XLSX parser
├── data/
│   ├── records.json           # Persistent declaration database
│   └── settings.json          # System settings & AI model configurations
├── samples/                   # Reference CusDec scans & master Excel registries
├── uploads/                   # Uploaded image scans & unzipped archives
├── start.bat                  # One-click Windows starter
└── test_system_next.js        # Full automated test suite
```
