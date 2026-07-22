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

function populateTemplateSelects(){
  const opts = Object.entries(TEMPLATES).map(([key,t])=>`<option value="${key}">${t.label}</option>`).join('');
  document.getElementById('templateSelect').innerHTML = opts;
  document.getElementById('quickTemplateSelect').innerHTML = opts;
}
populateTemplateSelects();

// Tabs
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x=>x.style.display='none');
    t.classList.add('active');
    document.getElementById('panel-'+t.dataset.tab).style.display='block';
  });
});

document.getElementById('fileNoInput').addEventListener('input', e=>{
  document.getElementById('fileNoDisplay').textContent = 'FILE NO. ' + (e.target.value || '—');
});

// File handling
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
dropzone.addEventListener('click', ()=>fileInput.click());
['dragover'].forEach(evt=>dropzone.addEventListener(evt, e=>{e.preventDefault(); dropzone.classList.add('drag');}));
['dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt, e=>{e.preventDefault(); dropzone.classList.remove('drag');}));
dropzone.addEventListener('drop', e=>{
  if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e=>{
  if(e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file){
  const isPdf = file.type === 'application/pdf';
  const isImg = ['image/jpeg','image/png','image/jpg'].includes(file.type);
  if(!isPdf && !isImg){ alert('Please upload a PDF, JPG or PNG.'); return; }
  state.pendingFile = file;
  document.getElementById('fileChipHolder').innerHTML =
    `<span class="file-chip">${file.name} <span class="x" onclick="clearFile()">✕</span></span>`;
  document.getElementById('extractBtn').disabled = false;
}

function clearFile(){
  state.pendingFile = null;
  document.getElementById('fileChipHolder').innerHTML = '';
  document.getElementById('extractBtn').disabled = true;
  fileInput.value = '';
}

// Backend connection
function getApiBase(){
  return (document.getElementById('apiBaseInput').value || 'http://localhost:4000').replace(/\/$/, '');
}
(function initApiBase(){
  let saved = 'http://localhost:4000';
  try{ saved = localStorage.getItem('noticeDeskApiBase') || saved; }catch(e){}
  document.getElementById('apiBaseInput').value = saved;
})();

document.getElementById('apiBaseInput').addEventListener('change', e=>{
  try{ localStorage.setItem('noticeDeskApiBase', e.target.value); }catch(err){}
  checkBackend();
});

async function checkBackend(){
  const statusEl = document.getElementById('backendStatus');
  statusEl.textContent = 'checking…'; statusEl.style.color = 'var(--muted)';
  try{
    const r = await fetch(getApiBase() + '/api/health');
    if(!r.ok) throw new Error('bad status');
    statusEl.textContent = '● connected'; statusEl.style.color = 'var(--teal)';
  }catch(e){
    statusEl.textContent = '● not reachable';
    statusEl.style.color = 'var(--rust)';
  }
}
checkBackend();

async function apiPostJSON(path, body){
  const res = await fetch(getApiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.message || data.error || ('Request failed (' + res.status + ')'));
  return data;
}

async function apiPostFile(path, file){
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(getApiBase() + path, { method: 'POST', body: form });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.message || data.error || ('Request failed (' + res.status + ')'));
  return data;
}

// Extraction
document.getElementById('extractBtn').addEventListener('click', async ()=>{
  const statusEl = document.getElementById('extractStatus');
  const errEl = document.getElementById('extractError');
  errEl.innerHTML = '';
  if(!state.pendingFile){ return; }
  statusEl.innerHTML = '<span class="loading">Reading notice…</span>';
  document.getElementById('extractBtn').disabled = true;

  try{
    const result = await apiPostFile('/api/extract', state.pendingFile);
    state.extracted = result.extracted;
    renderSummary(result.extracted);
    seedFiguresTable(result.extracted);
    statusEl.innerHTML = '<span style="color:var(--teal); font-family:var(--mono); font-size:12.5px;">Done</span>';
  }catch(e){
    errEl.innerHTML = `<div class="error-box">Could not extract details — ${e.message}</div>`;
    statusEl.innerHTML = '';
  }
  document.getElementById('extractBtn').disabled = false;
});

function renderSummary(d){
  document.getElementById('summaryBlock').style.display = 'block';
  const stampClass = d.notice_type === 'Unclear' ? 'neutral' : '';
  document.getElementById('summaryStamp').innerHTML =
    `<span class="stamp ${stampClass}">${d.notice_type || 'Notice'} · ${d.section || ''}</span>`;
  const items = [
    ['Issuing authority', d.issuing_authority],
    ['Notice number', d.notice_number],
    ['Period / FY', d.financial_year_period],
    ['Date of notice', d.date_of_notice],
    ['What it alleges', d.allegation_summary],
  ];
  document.getElementById('metaGrid').innerHTML = items.map(([k,v])=>
    `<div class="meta-item"><div class="k">${k}</div><div class="v">${v || 'Not stated'}</div></div>`
  ).join('');
  buildPrecedentLinks(d);
}

function seedFiguresTable(d){
  state.rows = (d.line_items && d.line_items.length ? d.line_items : [{particular:'', notice_amount:0}])
    .map(li => ({ particular: li.particular || '', notice: li.notice_amount ?? 0, book: '' }));
  renderFiguresTable();
}

function renderFiguresTable(){
  const body = document.getElementById('figuresBody');
  body.innerHTML = state.rows.map((r, i)=>{
    const diff = (r.book === '' || r.book === null || isNaN(r.book)) ? null : (Number(r.book) - Number(r.notice||0));
    let diffHtml = '<span style="color:var(--muted);">—</span>';
    if(diff !== null){
      diffHtml = diff === 0
        ? `<span class="diff-zero">0.00</span>`
        : `<span class="diff-pos">${diff>0?'+':''}${diff.toFixed(2)}</span>`;
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

function updateRow(i, field, value){
  state.rows[i][field] = field === 'particular' ? value : (value === '' ? '' : Number(value));
  renderFiguresTable();
}

function removeRow(i){ state.rows.splice(i,1); renderFiguresTable(); }

document.getElementById('addRowBtn').addEventListener('click', ()=>{
  state.rows.push({particular:'', notice:0, book:''});
  renderFiguresTable();
});

function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

// Reply generation
document.getElementById('generateReplyBtn').addEventListener('click', async ()=>{
  const statusEl = document.getElementById('replyStatus');
  const errEl = document.getElementById('replyError');
  errEl.innerHTML = '';
  if(!state.extracted){
    errEl.innerHTML = `<div class="error-box">Extract the notice first</div>`;
    return;
  }
  statusEl.innerHTML = '<span class="loading">Drafting…</span>';
  document.getElementById('generateReplyBtn').disabled = true;

  const d = state.extracted;
  const userInstructions = document.getElementById('replyInstructions').value.trim();
  const templateKey = document.getElementById('templateSelect').value;

  try{
    const result = await apiPostJSON('/api/reply', {
      notice: d,
      figures: state.rows.map(r => ({ particular: r.particular, notice_amount: r.notice, book_amount: r.book })),
      instructions: userInstructions,
      template_key: templateKey
    });
    document.getElementById('replyOutput').value = result.draft;
    statusEl.innerHTML = '<span style="color:var(--teal); font-family:var(--mono); font-size:12.5px;">Done</span>';
  }catch(e){
    errEl.innerHTML = `<div class="error-box">Could not generate — ${e.message}</div>`;
    statusEl.innerHTML='';
  }
  document.getElementById('generateReplyBtn').disabled = false;
});

document.getElementById('copyReplyBtn').addEventListener('click', ()=>{
  const el = document.getElementById('replyOutput');
  el.select(); document.execCommand('copy');
});

// Quick reply
document.getElementById('quickReplyBtn').addEventListener('click', async ()=>{
  const statusEl = document.getElementById('quickStatus');
  const errEl = document.getElementById('quickError');
  errEl.innerHTML = '';
  const text = document.getElementById('quickNoticeText').value.trim();
  if(!text){ errEl.innerHTML = `<div class="error-box">Paste notice text first</div>`; return; }
  statusEl.innerHTML = '<span class="loading">Drafting…</span>';
  document.getElementById('quickReplyBtn').disabled = true;

  const instructions = document.getElementById('quickInstructions').value.trim();
  const templateKey = document.getElementById('quickTemplateSelect').value;

  try{
    const result = await apiPostJSON('/api/quick-reply', {
      notice_text: text,
      instructions: instructions,
      template_key: templateKey
    });
    document.getElementById('quickOutput').value = result.draft;
    statusEl.innerHTML = '<span style="color:var(--teal); font-family:var(--mono); font-size:12.5px;">Done</span>';
  }catch(e){
    errEl.innerHTML = `<div class="error-box">Could not generate — ${e.message}</div>`;
    statusEl.innerHTML='';
  }
  document.getElementById('quickReplyBtn').disabled = false;
});

document.getElementById('copyQuickBtn').addEventListener('click', ()=>{
  const el = document.getElementById('quickOutput');
  el.select(); document.execCommand('copy');
});

// Precedents
function buildPrecedentLinks(d){
  const query = [d.section, d.notice_type, d.allegation_summary].filter(Boolean).join(' ').slice(0, 160);
  const q = encodeURIComponent(query);
  const links = [
    { name: 'Indian Kanoon', desc: 'Full-text case law search', url: `https://indiankanoon.org/search/?formInput=${q}` },
    { name: 'CBIC Circulars', desc: 'Official GST circulars', url: `https://www.cbic.gov.in/entities/gst-circular` },
    { name: 'Income Tax Dept', desc: 'Official CBDT circulars', url: `https://www.incometax.gov.in/iec/foportal/circulars` },
    { name: 'TaxGuru', desc: 'Practitioner commentary', url: `https://taxguru.in/?s=${q}` },
  ];
  document.getElementById('precedentLinks').innerHTML = links.map(l=>`
    <div class="precedent-card">
      <div class="t"><b>${l.name}</b><br>${l.desc}</div>
      <a class="btn ghost" href="${l.url}" target="_blank" rel="noopener">Open search →</a>
    </div>
  `).join('');
}
