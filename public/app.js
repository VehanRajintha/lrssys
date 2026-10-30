// =============================================================
// LRSYS MARITIME CUSTOMS PORTAL - APPLICATION LOGIC
// Automated Extraction, Verification, Tally Reconciliation & Themes
// =============================================================

// State
let allRecords = [];
let selectedRecord = null;
let currentFilter = 'ALL';
let pollTimer = null;
let zoomScale = 1.0;
let panOffset = { x: 0, y: 0 };
let selectedRowIds = new Set();

// DOM Elements
const recordsTableBody = document.getElementById('recordsTableBody');
const mobileCardsContainer = document.getElementById('mobileCardsContainer');
const statTotal = document.getElementById('statTotal');
const statVerified = document.getElementById('statVerified');
const statReview = document.getElementById('statReview');
const statAccuracy = document.getElementById('statAccuracy');
const countAll = document.getElementById('countAll');
const countReview = document.getElementById('countReview');
const countVerified = document.getElementById('countVerified');
const countCorrected = document.getElementById('countCorrected');

// Progress Radar
const progressBox = document.getElementById('progressBox');
const progressText = document.getElementById('progressText');
const progressBarFill = document.getElementById('progressBarFill');

// Checkbox and Bulk Actions
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const btnDeleteSelected = document.getElementById('btnDeleteSelected');
const selectedCountSpan = document.getElementById('selectedCount');
const btnReprocessAll = document.getElementById('btnReprocessAll');

// Tally State & Elements
let tallyResult = null;
let currentTallyFilter = 'MATCHED';

const navBtnOcr = document.getElementById('navBtnOcr');
const navBtnTally = document.getElementById('navBtnTally');
const sectionOcr = document.getElementById('sectionOcr');
const sectionTally = document.getElementById('sectionTally');

const tallySourceDb = document.getElementById('tallySourceDb');
const tallySourceUpload = document.getElementById('tallySourceUpload');
const tallyF1UploadContainer = document.getElementById('tallyF1UploadContainer');
const tallyF1Input = document.getElementById('tallyF1Input');
const tallyF2Input = document.getElementById('tallyF2Input');
const btnRunTally = document.getElementById('btnRunTally');
const tallyResultsCard = document.getElementById('tallyResultsCard');
const tallyTableBody = document.getElementById('tallyTableBody');
const tallyMobileContainer = document.getElementById('tallyMobileContainer');
const btnExportTallyExcel = document.getElementById('btnExportTallyExcel');
const btnExportTallyExcelBottom = document.getElementById('btnExportTallyExcelBottom');
const btnExportTallyCsv = document.getElementById('btnExportTallyCsv');
const btnExportTallyCsvBottom = document.getElementById('btnExportTallyCsvBottom');

const tallyStatF1 = document.getElementById('tallyStatF1');
const tallyStatF2 = document.getElementById('tallyStatF2');
const tallyStatMatched = document.getElementById('tallyStatMatched');
const tallyStatRate = document.getElementById('tallyStatRate');
const countTallyMatched = document.getElementById('countTallyMatched');
const countTallyUnmatchedF1 = document.getElementById('countTallyUnmatchedF1');
const countTallyUnmatchedF2 = document.getElementById('countTallyUnmatchedF2');

// Viewer & Quick Edit
const viewerImage = document.getElementById('viewerImage');
const viewerStatusPill = document.getElementById('viewerStatusPill');
const boxHighlight = document.getElementById('boxHighlight');
const quickEditForm = document.getElementById('quickEditForm');
const editGreenStamp = document.getElementById('editGreenStamp');
const editCustomsRef = document.getElementById('editCustomsRef');
const editConsignee = document.getElementById('editConsignee');
const editDeclarant = document.getElementById('editDeclarant');

// Inputs
const cameraInput = document.getElementById('cameraInput');
const multiFileInput = document.getElementById('multiFileInput');
const zipFileInput = document.getElementById('zipFileInput');
const searchInput = document.getElementById('searchInput');

// Theme Toggle
const themeToggleBtn = document.getElementById('themeToggleBtn');

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  fetchRecords();
  startQueuePolling();
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('lrsys-theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('lrsys-theme', theme);
  if (themeToggleBtn) {
    if (theme === 'dark') {
      themeToggleBtn.innerHTML = '<span class="theme-icon">☀️</span> <span class="theme-label">Light Mode</span>';
      themeToggleBtn.title = 'Switch to Crisp Maritime Light Mode';
    } else {
      themeToggleBtn.innerHTML = '<span class="theme-icon">🌙</span> <span class="theme-label">Dark Mode</span>';
      themeToggleBtn.title = 'Switch to Abyssal Deep Sea Dark Mode';
    }
  }
}

// -------------------------------------------------------------
// EVENT LISTENERS
// -------------------------------------------------------------
function setupEventListeners() {
  // Theme Toggle Button
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  // Upload Triggers
  document.getElementById('btnTriggerCamera').addEventListener('click', () => cameraInput.click());
  document.getElementById('btnTriggerUpload').addEventListener('click', () => multiFileInput.click());
  document.getElementById('btnTriggerZip').addEventListener('click', () => zipFileInput.click());

  cameraInput.addEventListener('change', (e) => handleFileUpload(e.target.files, '/api/upload', 'documents'));
  multiFileInput.addEventListener('change', (e) => handleFileUpload(e.target.files, '/api/upload', 'documents'));
  zipFileInput.addEventListener('change', (e) => handleFileUpload(e.target.files, '/api/upload-zip', 'zipfile'));

  // Demo Sample
  document.getElementById('btnLoadDemo').addEventListener('click', loadDemoSample);

  // Clear & Verify All & Reprocess
  document.getElementById('btnClearAll').addEventListener('click', clearAllRecords);
  document.getElementById('btnVerifyAll').addEventListener('click', verifyAllRecords);
  btnReprocessAll.addEventListener('click', reprocessAllWithAI);
  btnDeleteSelected.addEventListener('click', deleteSelectedRecords);

  // Select All Checkbox
  selectAllCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const filtered = getFilteredRecords();
    if (isChecked) {
      filtered.forEach(r => selectedRowIds.add(r.id));
    } else {
      selectedRowIds.clear();
    }
    updateSelectedCount();
    renderRecords();
  });

  // Search & Filter
  searchInput.addEventListener('input', debounce(() => fetchRecords(), 300));
  
  const filterPills = document.querySelectorAll('.tab-pill[data-filter], .tab-btn[data-filter]');
  filterPills.forEach(btn => {
    btn.addEventListener('click', () => {
      filterPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderRecords();
    });
  });

  // Viewer Zoom & Pan Controls
  document.getElementById('btnZoomIn').addEventListener('click', () => adjustZoom(0.25));
  document.getElementById('btnZoomOut').addEventListener('click', () => adjustZoom(-0.25));
  document.getElementById('btnZoomReset').addEventListener('click', resetZoom);
  setupCanvasDragControls();

  // Quick Edit Save
  document.getElementById('btnSaveQuickEdit').addEventListener('click', saveQuickEdit);

  // Queue Controls
  document.getElementById('btnPauseQueue').addEventListener('click', () => fetch('/api/queue/pause', { method: 'POST' }));
  document.getElementById('btnCancelQueue').addEventListener('click', () => fetch('/api/queue/cancel', { method: 'POST' }));

  // Nav Section Switcher
  navBtnOcr.addEventListener('click', () => switchSection('ocr'));
  navBtnTally.addEventListener('click', () => switchSection('tally'));

  // Tally Source Toggles
  tallySourceDb.addEventListener('change', () => {
    tallyF1UploadContainer.style.display = 'none';
  });
  tallySourceUpload.addEventListener('change', () => {
    tallyF1UploadContainer.style.display = 'block';
  });

  // Run Tally
  btnRunTally.addEventListener('click', runTallyMatching);

  // Tally Filter Tabs
  document.querySelectorAll('[data-tally-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tally-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTallyFilter = btn.dataset.tallyFilter;
      renderTallyResults();
    });
  });

  // Settings & Mobile Modals
  document.getElementById('btnMobileConnect').addEventListener('click', openMobileModal);
  document.getElementById('btnSettings').addEventListener('click', openSettingsModal);

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      const el = document.getElementById(modalId);
      if (el) el.classList.remove('active');
    });
  });

  document.getElementById('settingsForm').addEventListener('submit', saveSettings);
}

// -------------------------------------------------------------
// DATA FETCHING & RENDERING
// -------------------------------------------------------------
async function fetchRecords() {
  try {
    const q = searchInput.value.trim();
    const url = `/api/records?status=ALL${q ? `&search=${encodeURIComponent(q)}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    allRecords = data.records || [];
    updateStats(data.stats);
    renderRecords();

    // Select first record if none selected
    if (!selectedRecord && allRecords.length > 0) {
      selectRecord(allRecords[0]);
    }
  } catch (err) {
    console.error('Failed to fetch records:', err);
  }
}

function updateStats(stats) {
  if (!stats) return;
  statTotal.textContent = stats.total;
  statVerified.textContent = stats.verified + (stats.corrected || 0);
  statReview.textContent = stats.needsReview;
  statAccuracy.textContent = `${stats.accuracyRate}%`;

  countAll.textContent = stats.total;
  countReview.textContent = stats.needsReview;
  countVerified.textContent = stats.verified;
  countCorrected.textContent = stats.corrected || 0;
}

function getFilteredRecords() {
  const filtered = allRecords.filter(r => {
    if (currentFilter === 'ALL') return true;
    return r.status === currentFilter;
  });

  // Sort by Counter Stamp (000xxxx) in strictly ASCENDING order
  return filtered.sort((a, b) => {
    const numA = parseInt(String(a.greenStampNumber || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.greenStampNumber || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.greenStampNumber || '').localeCompare(String(b.greenStampNumber || ''));
  });
}

function updateSelectedCount() {
  const count = selectedRowIds.size;
  selectedCountSpan.textContent = count;
  btnDeleteSelected.style.display = count > 0 ? 'inline-flex' : 'none';
}

function renderRecords() {
  const filtered = getFilteredRecords();

  // 1. Render Desktop Table
  if (filtered.length === 0) {
    recordsTableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding: 2.5rem; color:var(--text-muted);">
          No declarations match the current filter.
        </td>
      </tr>`;
  } else {
    recordsTableBody.innerHTML = filtered.map((r, idx) => `
      <tr data-id="${r.id}" class="${selectedRecord && selectedRecord.id === r.id ? 'selected' : ''}">
        <td style="text-align:center;" onclick="event.stopPropagation();">
          <input type="checkbox" class="row-checkbox" data-id="${r.id}" ${selectedRowIds.has(r.id) ? 'checked' : ''}>
        </td>
        <td style="font-weight:700; color:var(--text-muted);">${idx + 1}</td>
        <td>
          <span class="stamp-badge">${escapeHtml(String(r.greenStampNumber).padStart(6, '0'))}</span>
        </td>
        <td style="font-weight:700; font-family:var(--font-mono);">${escapeHtml(r.customsRefNumber || '—')}</td>
        <td style="color:var(--text-muted); font-size:0.82rem;">${escapeHtml(r.customsDate || '—')}</td>
        <td style="font-weight:800; max-width:190px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:var(--text-main);" title="${escapeHtml(r.consigneeName || '')}">
          ${escapeHtml(r.consigneeName || '—')}
        </td>
        <td style="max-width:180px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:var(--ios-blue); font-weight:700;" title="${escapeHtml(r.declarantName || '')}">
          ${escapeHtml(r.declarantName || '—')}
        </td>
        <td>
          <span class="status-pill ${getStatusClass(r.status)}">${r.status}</span>
        </td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:0.3rem; align-items:center;">
            <button class="btn btn-steel btn-sm" title="Inspect" style="padding:0.32rem 0.65rem; font-size:0.78rem;" onclick="event.stopPropagation(); inspectRecord('${r.id}')">Inspect</button>
            <button class="btn btn-harbor btn-sm" title="Verify" style="padding:0.32rem 0.6rem; font-size:0.85rem; font-weight:900;" onclick="event.stopPropagation(); approveRecord('${r.id}')">✓</button>
            <button class="btn btn-danger-outline btn-sm" title="Delete" style="padding:0.32rem 0.55rem; font-size:0.82rem;" onclick="event.stopPropagation(); deleteSingleRecord('${r.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach row click listeners
    recordsTableBody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        const rec = allRecords.find(r => r.id === id);
        if (rec) selectRecord(rec);
      });
    });

    // Attach checkbox click listeners
    recordsTableBody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) {
          selectedRowIds.add(id);
        } else {
          selectedRowIds.delete(id);
        }
        updateSelectedCount();
      });
    });
  }

  // 2. Render Mobile Cargo Cards
  if (filtered.length === 0) {
    mobileCardsContainer.innerHTML = `
      <div style="text-align:center; padding: 2rem; color:var(--text-muted);">
        No declarations match current filter.
      </div>`;
  } else {
    mobileCardsContainer.innerHTML = filtered.map(r => `
      <div class="cargo-card" data-id="${r.id}">
        <div class="cargo-card-top">
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <input type="checkbox" class="mobile-row-checkbox" data-id="${r.id}" ${selectedRowIds.has(r.id) ? 'checked' : ''}>
            <span class="stamp-badge">${escapeHtml(String(r.greenStampNumber).padStart(6, '0'))}</span>
          </div>
          <span class="status-pill ${getStatusClass(r.status)}">${r.status}</span>
        </div>
        <div class="cargo-card-prop">
          <span class="prop-name">Customs Reference</span>
          <span class="prop-val" style="font-family:var(--font-mono);">${escapeHtml(r.customsRefNumber || '—')} <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(${escapeHtml(r.customsDate || '')})</span></span>
        </div>
        <div class="cargo-card-prop">
          <span class="prop-name">Consignee (Importer)</span>
          <span class="prop-val" style="color:var(--text-main); font-weight:800;">${escapeHtml(r.consigneeName || '—')}</span>
        </div>
        <div class="cargo-card-prop">
          <span class="prop-name">Declarant Name (Box 14)</span>
          <span class="prop-val" style="color:var(--ocean-blue); font-weight:700;">${escapeHtml(r.declarantName || '—')}</span>
        </div>
        <div class="cargo-card-actions">
          <button class="btn btn-steel btn-sm" style="flex:1;" onclick="inspectRecord('${r.id}')">🔍 Inspect</button>
          <button class="btn btn-harbor btn-sm" style="flex:1;" onclick="approveRecord('${r.id}')">✓ Approve</button>
          <button class="btn btn-danger-outline btn-sm" onclick="deleteSingleRecord('${r.id}')">🗑️</button>
        </div>
      </div>
    `).join('');

    mobileCardsContainer.querySelectorAll('.mobile-row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) {
          selectedRowIds.add(id);
        } else {
          selectedRowIds.delete(id);
        }
        updateSelectedCount();
      });
    });
  }

  updateSelectedCount();
}

function getStatusClass(status) {
  switch (status) {
    case 'VERIFIED': return 'status-verified';
    case 'CORRECTED': return 'status-corrected';
    default: return 'status-review';
  }
}

// -------------------------------------------------------------
// VIEWER & INSPECTION
// -------------------------------------------------------------
function selectRecord(record) {
  selectedRecord = record;
  
  // Highlight active row in table
  document.querySelectorAll('.ledger-table tr, .data-table tr').forEach(r => r.classList.remove('selected'));
  const row = document.querySelector(`tr[data-id="${record.id}"]`);
  if (row) row.classList.add('selected');

  // Update Left Pane Image & Status
  viewerImage.src = record.imageUrl || `/api/images/${encodeURIComponent(record.filename)}`;
  viewerStatusPill.textContent = record.status;
  viewerStatusPill.className = `status-pill ${getStatusClass(record.status)}`;

  // Populate Quick Edit Form
  quickEditForm.style.display = 'flex';
  editGreenStamp.value = String(record.greenStampNumber || '').padStart(6, '0');
  editCustomsRef.value = record.customsRefNumber || '';
  editConsignee.value = record.consigneeName || '';
  editDeclarant.value = record.declarantName || '';

  resetZoom();
}

function inspectRecord(id) {
  const rec = allRecords.find(r => r.id === id);
  if (rec) {
    selectRecord(rec);
    if (window.innerWidth <= 1024) {
      document.querySelector('.inspection-bay').scrollIntoView({ behavior: 'smooth' });
    }
  }
}

async function approveRecord(id) {
  try {
    const res = await fetch(`/api/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VERIFIED', manualCorrection: true })
    });
    if (res.ok) {
      fetchRecords();
    }
  } catch (err) {
    console.error('Approve failed:', err);
  }
}

async function saveQuickEdit() {
  if (!selectedRecord) return;
  const updates = {
    greenStampNumber: editGreenStamp.value.trim(),
    customsRefNumber: editCustomsRef.value.trim(),
    consigneeName: editConsignee.value.trim().toUpperCase(),
    declarantName: editDeclarant.value.trim().toUpperCase(),
    status: 'CORRECTED',
    manualCorrection: true
  };

  try {
    const res = await fetch(`/api/records/${selectedRecord.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      fetchRecords();
      alert('Declaration verified & saved successfully!');
    }
  } catch (err) {
    alert('Failed to save update: ' + err.message);
  }
}

// -------------------------------------------------------------
// CURSOR DRAG & ZOOM CONTROLS (Moveable with Cursor & Touch)
// -------------------------------------------------------------
let isCanvasDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialPanX = 0;
let initialPanY = 0;

function setupCanvasDragControls() {
  const container = document.getElementById('canvasContainer');
  if (!container || !viewerImage) return;

  // Mouse Drag Start
  container.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isCanvasDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialPanX = panOffset.x;
    initialPanY = panOffset.y;
    container.classList.add('grabbing');
  });

  // Global Mouse Move while Dragging
  window.addEventListener('mousemove', (e) => {
    if (!isCanvasDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    panOffset.x = initialPanX + dx;
    panOffset.y = initialPanY + dy;
    applyTransform(false); // Instant 60fps tracking
  });

  // Global Mouse Up / Release
  window.addEventListener('mouseup', () => {
    if (isCanvasDragging) {
      isCanvasDragging = false;
      container.classList.remove('grabbing');
    }
  });

  // Mouse Wheel Zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    adjustZoom(delta);
  }, { passive: false });

  // Touch Support for Mobile / Tablets
  let initialPinchDist = 0;
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isCanvasDragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      initialPanX = panOffset.x;
      initialPanY = panOffset.y;
    } else if (e.touches.length === 2) {
      isCanvasDragging = false;
      initialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isCanvasDragging && e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragStartX;
      const dy = e.touches[0].clientY - dragStartY;
      panOffset.x = initialPanX + dx;
      panOffset.y = initialPanY + dy;
      applyTransform(false);
    } else if (e.touches.length === 2 && initialPinchDist > 0) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const diff = (currentDist - initialPinchDist) * 0.005;
      adjustZoom(diff);
      initialPinchDist = currentDist;
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isCanvasDragging = false;
    initialPinchDist = 0;
  });
}

function adjustZoom(delta) {
  zoomScale = Math.max(0.4, Math.min(5.0, zoomScale + delta));
  applyTransform(true);
}

function resetZoom() {
  zoomScale = 1.0;
  panOffset = { x: 0, y: 0 };
  applyTransform(true);
  if (boxHighlight) boxHighlight.style.display = 'none';
}

function applyTransform(smooth = false) {
  if (!viewerImage) return;
  viewerImage.style.transition = smooth ? 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
  viewerImage.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`;
}

// -------------------------------------------------------------
// UPLOADS & DEMO
// -------------------------------------------------------------
async function handleFileUpload(files, endpoint, fieldName) {
  if (!files || files.length === 0) return;

  const formData = new FormData();
  if (fieldName === 'documents') {
    for (let i = 0; i < files.length; i++) {
      formData.append('documents', files[i]);
    }
  } else {
    formData.append(fieldName, files[0]);
  }

  try {
    progressBox.classList.add('active');
    progressText.textContent = `Uploading ${files.length} file(s)...`;
    progressBarFill.style.width = '10%';

    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    progressText.textContent = `Enqueued ${data.count} document(s). Processing batch queue...`;
    fetchRecords();
  } catch (err) {
    alert('Upload error: ' + err.message);
  } finally {
    cameraInput.value = '';
    multiFileInput.value = '';
    zipFileInput.value = '';
  }
}

async function loadDemoSample() {
  try {
    progressBox.classList.add('active');
    progressText.textContent = 'Enqueuing verified sample CusDec (000073)...';
    const res = await fetch('/api/demo/load-sample', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setTimeout(fetchRecords, 500);
  } catch (err) {
    alert('Failed to load demo: ' + err.message);
  }
}

async function deleteSingleRecord(id) {
  if (!confirm('Are you sure you want to delete this declaration record?')) return;
  try {
    const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
    if (res.ok) {
      selectedRowIds.delete(id);
      fetchRecords();
    }
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function deleteSelectedRecords() {
  const ids = Array.from(selectedRowIds);
  if (ids.length === 0) return;
  if (!confirm(`Are you sure you want to delete ${ids.length} selected declaration(s)?`)) return;

  try {
    const res = await fetch('/api/records/delete-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (res.ok) {
      selectedRowIds.clear();
      selectAllCheckbox.checked = false;
      fetchRecords();
    }
  } catch (err) {
    alert('Bulk delete failed: ' + err.message);
  }
}

async function reprocessAllWithAI() {
  if (!confirm('This will wipe the current records and re-extract all uploaded images using Google Gemini Vision AI. Proceed?')) return;
  try {
    progressBox.classList.add('active');
    progressText.textContent = 'Enqueuing all uploaded images for Gemini AI re-extraction...';
    progressBarFill.style.width = '10%';
    const res = await fetch('/api/records/reprocess-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    selectedRowIds.clear();
    selectAllCheckbox.checked = false;
    fetchRecords();
  } catch (err) {
    alert('Failed to reprocess: ' + err.message);
  }
}

async function clearAllRecords() {
  if (!confirm('Are you sure you want to clear all extracted declarations from the system?')) return;
  try {
    await fetch('/api/records/clear', { method: 'POST' });
    selectedRecord = null;
    selectedRowIds.clear();
    selectAllCheckbox.checked = false;
    viewerImage.src = '';
    quickEditForm.style.display = 'none';
    fetchRecords();
  } catch (err) {
    alert('Failed to clear records');
  }
}

async function verifyAllRecords() {
  try {
    await fetch('/api/records/verify-all', { method: 'POST' });
    fetchRecords();
  } catch (err) {
    alert('Failed to verify all');
  }
}

// -------------------------------------------------------------
// QUEUE POLLING
// -------------------------------------------------------------
function startQueuePolling() {
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/queue/status');
      const data = await res.json();
      const q = data.queue;

      if (q && q.isProcessing) {
        progressBox.classList.add('active');
        progressText.textContent = `Batch Processing: ${q.completedCount} / ${q.totalCount} completed (${q.progressPercent}%) - ${q.inFlightCount} active workers`;
        progressBarFill.style.width = `${q.progressPercent}%`;
        fetchRecords();
      } else if (progressBox.classList.contains('active')) {
        progressText.textContent = `All ${q.totalCount} documents processed successfully!`;
        progressBarFill.style.width = '100%';
        setTimeout(() => {
          progressBox.classList.remove('active');
        }, 2500);
        fetchRecords();
      }
    } catch (err) {
      // Quiet fail during network blips
    }
  }, 1500);
}

// -------------------------------------------------------------
// MODALS: MOBILE CONNECT & SETTINGS
// -------------------------------------------------------------
async function openMobileModal() {
  try {
    const res = await fetch('/api/system/info');
    const info = await res.json();
    const modal = document.getElementById('modalMobile');
    const urlDisplay = document.getElementById('mobileUrlDisplay');
    const canvas = document.getElementById('qrCodeCanvas');

    const primaryUrl = info.primaryLanUrl || `http://localhost:${info.port}`;
    urlDisplay.textContent = primaryUrl;

    if (window.QRCode) {
      window.QRCode.toCanvas(canvas, primaryUrl, { width: 220, margin: 2 }, (err) => {
        if (err) console.error(err);
      });
    }

    modal.classList.add('active');
  } catch (err) {
    alert('Failed to get system info: ' + err.message);
  }
}

async function openSettingsModal() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    document.getElementById('cfgApiKey').value = s.geminiApiKey || '';
    document.getElementById('cfgModel').value = s.geminiModel || 'gemini-3.1-flash-lite';
    document.getElementById('cfgConcurrency').value = s.workerConcurrency || 3;
    document.getElementById('cfgThreshold').value = s.autoVerifyThreshold || 90;
    document.getElementById('modalSettings').classList.add('active');
  } catch (err) {
    alert('Failed to load settings');
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const updates = {
    geminiApiKey: document.getElementById('cfgApiKey').value.trim(),
    geminiModel: document.getElementById('cfgModel').value,
    workerConcurrency: parseInt(document.getElementById('cfgConcurrency').value, 10),
    autoVerifyThreshold: parseInt(document.getElementById('cfgThreshold').value, 10)
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      document.getElementById('modalSettings').classList.remove('active');
      alert('Settings saved successfully!');
    }
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

// -------------------------------------------------------------
// TALLY SECTION CONTROLLERS
// -------------------------------------------------------------
function switchSection(view) {
  if (view === 'ocr') {
    sectionOcr.style.display = 'flex';
    sectionTally.style.display = 'none';
    navBtnOcr.classList.add('active');
    navBtnTally.classList.remove('active');
  } else {
    sectionOcr.style.display = 'none';
    sectionTally.style.display = 'flex';
    navBtnOcr.classList.remove('active');
    navBtnTally.classList.add('active');
    tallyStatF1.textContent = allRecords.length;
  }
}

async function runTallyMatching() {
  const isUploadF1 = tallySourceUpload.checked;

  if (isUploadF1 && (!tallyF1Input.files || tallyF1Input.files.length === 0)) {
    return alert('Please select Generated Excel File 1 to upload.');
  }
  if (!tallyF2Input.files || tallyF2Input.files.length === 0) {
    return alert('Please select Master Reference Excel / CSV File 2 to compare.');
  }

  const formData = new FormData();
  if (isUploadF1) {
    formData.append('file1', tallyF1Input.files[0]);
  }
  formData.append('file2', tallyF2Input.files[0]);

  try {
    btnRunTally.disabled = true;
    btnRunTally.textContent = '⏳ Reconciling Consignees & Declarants...';

    const res = await fetch('/api/tally/run', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Tally failed');

    tallyResult = data;
    updateTallyStats(data.stats);
    tallyResultsCard.style.display = 'flex';
    const hasMatches = data.matched && data.matched.length > 0;
    btnExportTallyExcel.style.display = hasMatches ? 'inline-flex' : 'none';
    btnExportTallyCsv.style.display = hasMatches ? 'inline-flex' : 'none';
    btnExportTallyExcelBottom.style.display = hasMatches ? 'inline-flex' : 'none';
    btnExportTallyCsvBottom.style.display = hasMatches ? 'inline-flex' : 'none';
    renderTallyResults();

    alert(`Tally Complete! Found ${data.matched.length} declarations where BOTH Consignee and Declarant matched.`);
  } catch (err) {
    alert('Tally Error: ' + err.message);
  } finally {
    btnRunTally.disabled = false;
    btnRunTally.textContent = '⚡ Compare & Run Tally Matching';
  }
}

function updateTallyStats(stats) {
  if (!stats) return;
  tallyStatF1.textContent = stats.totalFile1;
  tallyStatF2.textContent = stats.totalFile2;
  tallyStatMatched.textContent = stats.matchedCount;
  tallyStatRate.textContent = `${stats.matchRate}%`;

  countTallyMatched.textContent = stats.matchedCount;
  countTallyUnmatchedF1.textContent = stats.unmatchedFile1Count;
  countTallyUnmatchedF2.textContent = stats.unmatchedFile2Count;
}

function renderTallyResults() {
  if (!tallyResult) return;

  let displayItems = [];
  if (currentTallyFilter === 'MATCHED') {
    displayItems = tallyResult.matched || [];
  } else if (currentTallyFilter === 'UNMATCHED_F1') {
    displayItems = tallyResult.unmatchedFile1 || [];
  } else {
    displayItems = tallyResult.unmatchedFile2 || [];
  }

  // 1. Desktop Table
  if (displayItems.length === 0) {
    tallyTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 2.5rem; color:var(--text-muted);">
          No items found for this tally filter.
        </td>
      </tr>`;
  } else {
    tallyTableBody.innerHTML = displayItems.map((item, idx) => {
      const isMatched = currentTallyFilter === 'MATCHED';
      const stamp = item.counterStamp ? escapeHtml(String(item.counterStamp).padStart(6, '0')) : '—';
      const badgeHtml = isMatched 
        ? `<span class="status-pill status-verified">✓ BOTH MATCHED</span>`
        : `<span class="status-pill status-review">UNMATCHED</span>`;

      return `
        <tr>
          <td style="font-weight:700; color:var(--text-muted);">${idx + 1}</td>
          <td><span class="stamp-badge">${stamp}</span></td>
          <td style="font-weight:700; font-family:var(--font-mono);">${escapeHtml(item.customsRef || '—')}</td>
          <td style="color:var(--text-muted); font-size:0.82rem;">${escapeHtml(item.date || '—')}</td>
          <td style="font-weight:800; max-width:200px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:var(--text-main);" title="${escapeHtml(item.consigneeName || '')}">${escapeHtml(item.consigneeName || '—')}</td>
          <td style="color:var(--ios-blue); max-width:180px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-weight:700;" title="${escapeHtml(item.declarantName || '')}">${escapeHtml(item.declarantName || '—')}</td>
          <td>${badgeHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // 2. Mobile Cargo Cards
  if (displayItems.length === 0) {
    tallyMobileContainer.innerHTML = `
      <div style="text-align:center; padding: 2rem; color:var(--text-muted);">
        No items found for this filter.
      </div>`;
  } else {
    tallyMobileContainer.innerHTML = displayItems.map(item => {
      const isMatched = currentTallyFilter === 'MATCHED';
      const stamp = item.counterStamp ? escapeHtml(String(item.counterStamp).padStart(6, '0')) : '—';
      return `
        <div class="cargo-card">
          <div class="cargo-card-top">
            <span class="stamp-badge">${stamp}</span>
            <span class="status-pill ${isMatched ? 'status-verified' : 'status-review'}">
              ${isMatched ? '✓ BOTH MATCHED' : 'UNMATCHED'}
            </span>
          </div>
          <div class="cargo-card-prop">
            <span class="prop-name">Customs Ref</span>
            <span class="prop-val" style="font-family:var(--font-mono);">${escapeHtml(item.customsRef || '—')} <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(${escapeHtml(item.date || '')})</span></span>
          </div>
          <div class="cargo-card-prop">
            <span class="prop-name">Consignee (Importer)</span>
            <span class="prop-val" style="color:var(--text-main); font-weight:800;">${escapeHtml(item.consigneeName || '—')}</span>
          </div>
          <div class="cargo-card-prop">
            <span class="prop-name">Declarant Name</span>
            <span class="prop-val" style="color:var(--ocean-blue); font-weight:700;">${escapeHtml(item.declarantName || '—')}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Helpers
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
