const getApiBase = () => {
  // If running on Render (production)
  if (window.location.hostname.includes('onrender.com')) {
    return window.location.origin;
  }
  // If localhost (development)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  // Default to current origin
  return window.location.origin;
};

let allTimezones = [];
let currentFilter = 'all';
let updateInterval;

const gridView = document.getElementById('gridView');
const singleView = document.getElementById('singleView');
const gridViewBtn = document.getElementById('gridViewBtn');
const singleViewBtn = document.getElementById('singleViewBtn');
const clocksGrid = document.getElementById('clocksGrid');
const searchInput = document.getElementById('searchInput');
const timezoneSelect = document.getElementById('timezoneSelect');
const singleClockDisplay = document.getElementById('singleClockDisplay');

const state = {
  pendingFile: null,
  extracted: null,
  rows: []
};

const TEMPLATES = {
  gst_73: { label: 'GST — Section 73 (short payment / ITC mismatch)' },
  gst_74: { label: 'GST — Section 74 (fraud / wilful suppression)' },
  it_143_2: { label: 'Income Tax — Section 143(2) (scrutiny)' },
  tds_200a: { label: 'TDS — Section 200A' },
  generic: { label: 'Generic' }
};

function populateTemplateSelects() {
  const opts = Object.entries(TEMPLATES).map(([key, t]) => `<option value="${key}">${t.label}</option>`).join('');
  const templateSelect = document.getElementById('templateSelect');
  const quickTemplateSelect = document.getElementById('quickTemplateSelect');
  if (templateSelect) templateSelect.innerHTML = opts;
  if (quickTemplateSelect) quickTemplateSelect.innerHTML = opts;
}
populateTemplateSelects();

// Tabs
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.style.display = 'none');
    t.classList.add('active');
    document.getElementById('panel-' + t.dataset.tab).style.display = 'block';
  });
});

const fileNoInput = document.getElementById('fileNoInput');
if (fileNoInput) {
  fileNoInput.addEventListener('input', e => {
    const display = document.getElementById('fileNoDisplay');
    if (display) display.textContent = 'FILE NO. ' + (e.target.value || '—');
  });
}

// File handling
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
if (dropzone && fileInput) {
  dropzone.addEventListener('click', () => fileInput.click());
  ['dragover'].forEach(evt => dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.remove('drag');
  }));
  dropzone.addEventListener('drop', e => {
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  const isPdf = file.type === 'application/pdf';
  const isImg = ['image/jpeg', 'image/png', 'image/jpg'].includes(file.type);
  if (!isPdf && !isImg) { alert('Please upload a PDF, JPG or PNG.'); return; }
  state.pendingFile = file;
  const chip = document.getElementById('fileChipHolder');
  if (chip) chip.innerHTML = `<span class="file-chip">${file.name} <span class="x" onclick="clearFile()">✕</span></span>`;
  const btn = document.getElementById('extractBtn');
  if (btn) btn.disabled = false;
}

function clearFile() {
  state.pendingFile = null;
  const chip = document.getElementById('fileChipHolder');
  if (chip) chip.innerHTML = '';
  const btn = document.getElementById('extractBtn');
  if (btn) btn.disabled = true;
  fileInput.value = '';
}

// Backend check
function checkBackend() {
  const statusEl = document.getElementById('backendStatus');
  const apiBase = getApiBase();
  if (!statusEl) return;
  
  statusEl.textContent = 'checking…';
  statusEl.style.color = 'var(--muted)';
  
  fetch(apiBase + '/api/health', { mode: 'cors' })
    .then(r => {
      if (!r.ok) throw new Error('bad status');
      return r.json();
    })
    .then(() => {
      statusEl.textContent = '● connected';
      statusEl.style.color = 'var(--teal)';
    })
    .catch(() => {
      statusEl.textContent = '● not reachable';
      statusEl.style.color = 'var(--rust)';
    });
}

setTimeout(checkBackend, 500);

async function apiPostJSON(path, body) {
  const res = await fetch(getApiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    mode: 'cors'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || ('Request failed (' + res.status + ')'));
  return data;
}

async function apiPostFile(path, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(getApiBase() + path, {
    method: 'POST',
    body: form,
    mode: 'cors'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || ('Request failed (' + res.status + ')'));
  return data;
}

// Extraction
const extractBtn = document.getElementById('extractBtn');
if (extractBtn) {
  extractBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('extractStatus');
    const errEl = document.getElementById('extractError');
    if (errEl) errEl.innerHTML = '';
    if (!state.pendingFile) { return; }
    if (statusEl) statusEl.innerHTML = '<span class="loading">Reading notice…</span>';
    if (extractBtn) extractBtn.disabled = true;

    try {
      const result = await apiPostFile('/api/extract', state.pendingFile);
      state.extracted = result.extracted;
      renderSummary(result.extracted);
      seedFiguresTable(result.extracted);
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--teal); font-family:var(--mono); font-size:12.5px;">Done</span>';
    } catch (e) {
      if (errEl) errEl.innerHTML = `<div class="error-box">Could not extract details — ${e.message}</div>`;
      if (statusEl) statusEl.innerHTML = '';
    }
    if (extractBtn) extractBtn.disabled = false;
  });
}

function renderSummary(d) {
  const block = document.getElementById('summaryBlock');
  if (!block) return;
  block.style.display = 'block';
  const stampClass = d.notice_type === 'Unclear' ? 'neutral' : '';
  const stamp = document.getElementById('summaryStamp');
  if (stamp) stamp.innerHTML = `<span class="stamp ${stampClass}">${d.notice_type || 'Notice'} · ${d.section || ''}</span>`;
  const items = [
    ['Issuing authority', d.issuing_authority],
    ['Notice number', d.notice_number],
    ['Period / FY', d.financial_year_period],
    ['Date of notice', d.date_of_notice],
    ['What it alleges', d.allegation_summary],
  ];
  const grid = document.getElementById('metaGrid');
  if (grid) grid.innerHTML = items.map(([k, v]) =>
    `<div class="meta-item"><div class="k">${k}</div><div class="v">${v || 'Not stated'}</div></div>`
  ).join('');
  buildPrecedentLinks(d);
}

function seedFiguresTable(d) {
  state.rows = (d.line_items && d.line_items.length ? d.line_items : [{ particular: '', notice_amount: 0 }])
    .map(li => ({ particular: li.particular || '', notice: li.notice_amount ?? 0, book: '' }));
  renderFiguresTable();
}

function renderFiguresTable() {
  const body = document.getElementById('figuresBody');
  if (!body) return;
  body.innerHTML = state.rows.map((r, i) => {
    const diff = (r.book === '' || r.book === null || isNaN(r.book)) ? null : (Number(r.book) - Number(r.notice || 0));
    let diffHtml = '<span style="color:var(--muted);">—</span>';
    if (diff !== null) {
      diffHtml = diff === 0
        ? `<span class="diff-zero">0.00</span>`
        : `<span class="diff-pos">${diff > 0 ? '+' : ''}${diff.toFixed(2)}</span>`;
    }
    return `<tr>
      <td class="rowlabel"><input value="${escapeAttr(r.particular)}" onchange="updateRow(${i},'particular',this.value)"></td>
      <td><input type="number" step="0.01" value="${r.notice}" onchange="updateRow(${i},'notice',this.value)"></td>
      <td><input type="number" step="0.01" value="${r.book}" placeholder="enter" onchange="updateRow(${i},'book',this.value)"></td>
      <td>${diffHtml}</td>
      <td><span class="x" style="cursor:pointer;color:var(--rust);" onclick="removeRow(${i})">✕</span></td>
    </tr>`;
  }).join('');
}

function updateRow(i, field, value) {
  state.rows[i][field] = field === 'particular' ? value : (value === '' ? '' : Number(value));
  renderFiguresTable();
}

function removeRow(i) {
  state.rows.splice(i, 1);
  renderFiguresTable();
}

const addRowBtn = document.getElementById('addRowBtn');
if (addRowBtn) {
  addRowBtn.addEventListener('click', () => {
    state.rows.push({ particular: '', notice: 0, book: '' });
    renderFiguresTable();
  });
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

// Reply generation
const generateReplyBtn = document.getElementById('generateReplyBtn');
if (generateReplyBtn) {
  generateReplyBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('replyStatus');
    const errEl = document.getElementById('replyError');
    if (errEl) errEl.innerHTML = '';
    if (!state.extracted) {
      if (errEl) errEl.innerHTML = `<div class="error-box">Extract the notice first</div>`;
      return;
    }
    if (statusEl) statusEl.innerHTML = '<span class="loading">Drafting…</span>';
    if (generateReplyBtn) generateReplyBtn.disabled = true;

    const d = state.extracted;
    const userInstructions = document.getElementById('replyInstructions')?.value.trim() || '';
    const templateKey = document.getElementById('templateSelect')?.value || 'generic';

    try {
      const result = await apiPostJSON('/api/reply', {
        notice: d,
        figures: state.rows.map(r => ({ particular: r.particular, notice_amount: r.notice, book_amount: r.book })),
        instructions: userInstructions,
        template_key: templateKey
      });
      const output = document.getElementById('replyOutput');
      if (output) output.value = result.draft;
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--teal); font-family:var(--mono); font-size:12.5px;">Done</span>';
    } catch (e) {
      if (errEl) errEl.innerHTML = `<div class="error-box">Could not generate — ${e.message}</div>`;
      if (statusEl) statusEl.innerHTML = '';
    }
    if (generateReplyBtn) generateReplyBtn.disabled = false;
  });
}

const copyReplyBtn = document.getElementById('copyReplyBtn');
if (copyReplyBtn) {
  copyReplyBtn.addEventListener('click', () => {
    const el = document.getElementById('replyOutput');
    if (el) {
      el.select();
      document.execCommand('copy');
    }
  });
}

const insertSkeletonBtn = document.getElementById('insertSkeletonBtn');
if (insertSkeletonBtn) {
  insertSkeletonBtn.addEventListener('click', () => {
    const templateKey = document.getElementById('templateSelect')?.value || 'generic';
    const template = TEMPLATES[templateKey];
    if (template) {
      const output = document.getElementById('replyOutput');
      if (output) output.value = template.skeleton || '';
    }
  });
}

// Quick reply
const quickReplyBtn = document.getElementById('quickReplyBtn');
if (quickReplyBtn) {
  quickReplyBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('quickStatus');
    const errEl = document.getElementById('quickError');
    if (errEl) errEl.innerHTML = '';
    const text = document.getElementById('quickNoticeText')?.value.trim() || '';
    if (!text) {
      if (errEl) errEl.innerHTML = `<div class="error-box">Paste notice text first</div>`;
      return;
    }
    if (statusEl) statusEl.innerHTML = '<span class="loading">Drafting…</span>';
    if (quickReplyBtn) quickReplyBtn.disabled = true;

    const instructions = document.getElementById('quickInstructions')?.value.trim() || '';
    const templateKey = document.getElementById('quickTemplateSelect')?.value || 'generic';

    try {
      const result = await apiPostJSON('/api/quick-reply', {
        notice_text: text,
        instructions: instructions,
        template_key: templateKey
      });
      const output = document.getElementById('quickOutput');
      if (output) output.value = result.draft;
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--teal); font-family:var(--mono); font-size:12.5px;">Done</span>';
    } catch (e) {
      if (errEl) errEl.innerHTML = `<div class="error-box">Could not generate — ${e.message}</div>`;
      if (statusEl) statusEl.innerHTML = '';
    }
    if (quickReplyBtn) quickReplyBtn.disabled = false;
  });
}

const copyQuickBtn = document.getElementById('copyQuickBtn');
if (copyQuickBtn) {
  copyQuickBtn.addEventListener('click', () => {
    const el = document.getElementById('quickOutput');
    if (el) {
      el.select();
      document.execCommand('copy');
    }
  });
}

// Precedents
function buildPrecedentLinks(d) {
  const query = [d.section, d.notice_type, d.allegation_summary].filter(Boolean).join(' ').slice(0, 160);
  const q = encodeURIComponent(query);
  const links = [
    { name: 'Indian Kanoon', desc: 'Full-text case law search', url: `https://indiankanoon.org/search/?formInput=${q}` },
    { name: 'CBIC Circulars', desc: 'Official GST circulars', url: `https://www.cbic.gov.in/entities/gst-circular` },
    { name: 'Income Tax Dept', desc: 'Official CBDT circulars', url: `https://www.incometax.gov.in/iec/foportal/circulars` },
    { name: 'TaxGuru', desc: 'Practitioner commentary', url: `https://taxguru.in/?s=${q}` },
  ];
  const el = document.getElementById('precedentLinks');
  if (el) el.innerHTML = links.map(l => `
    <div class="precedent-card">
      <div class="t"><b>${l.name}</b><br>${l.desc}</div>
      <a class="btn ghost" href="${l.url}" target="_blank" rel="noopener">Open search →</a>
    </div>
  `).join('');
}
