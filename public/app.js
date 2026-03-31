'use strict';

// ── API helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const get    = (path)        => api('GET',    path);
const post   = (path, body)  => api('POST',   path, body);
const put    = (path, body)  => api('PUT',    path, body);
const del    = (path)        => api('DELETE', path);

// ── Toast notifications ──────────────────────────────────────────────────────

const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ── Tab navigation ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'history') loadHistory();
  });
});

// ── Modal helpers ────────────────────────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'));
});
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});

// ── State ────────────────────────────────────────────────────────────────────

let configs = [];
let jobs    = [];
let currentRuns = [];

// ── Event delegation ─────────────────────────────────────────────────────────

document.getElementById('configs-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'edit-config')   editConfig(id);
  if (action === 'delete-config') deleteConfig(id);
});

document.getElementById('jobs-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, enabled } = btn.dataset;
  if (action === 'run-job')    runJobNow(id);
  if (action === 'edit-job')   editJob(id);
  if (action === 'toggle-job') toggleJob(id, enabled === '1');
  if (action === 'delete-job') deleteJob(id);
});

document.getElementById('history-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'view-result') {
    const run = currentRuns[Number(btn.dataset.runIndex)];
    if (run) showResult(run.result || run.error || '');
  }
});

// ── Configs ──────────────────────────────────────────────────────────────────

async function loadConfigs() {
  configs = await get('/configs');
  renderConfigs();
}

function renderConfigs() {
  const el = document.getElementById('configs-list');
  if (!configs.length) {
    el.innerHTML = '<p class="empty-state">No LLM configurations yet. Create one to get started.</p>';
    return;
  }
  el.innerHTML = configs.map(c => `
    <div class="card">
      <div class="card-title">
        <span class="badge badge-${escHtml(c.provider)}">${escHtml(c.provider)}</span>
        ${escHtml(c.name)}
      </div>
      <div class="card-meta">
        <span>Model: ${escHtml(c.model)}</span>
        ${c.base_url ? `<span>URL: ${escHtml(c.base_url)}</span>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-config" data-id="${escAttr(c.id)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete-config" data-id="${escAttr(c.id)}">Delete</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('btn-new-config').addEventListener('click', () => {
  document.getElementById('config-id').value = '';
  document.getElementById('form-config').reset();
  document.getElementById('modal-config-title').textContent = 'New LLM Config';
  toggleBaseUrl();
  openModal('modal-config');
});

document.getElementById('config-provider').addEventListener('change', toggleBaseUrl);

function toggleBaseUrl() {
  const prov = document.getElementById('config-provider').value;
  const lbl  = document.getElementById('label-base-url');
  const inp  = document.getElementById('config-base-url');
  if (prov === 'custom') {
    lbl.classList.remove('hidden');
    inp.required = true;
  } else {
    lbl.classList.add('hidden');
    inp.required = false;
  }
}

function editConfig(id) {
  const c = configs.find(x => x.id === id);
  if (!c) return;
  document.getElementById('config-id').value    = c.id;
  document.getElementById('config-name').value  = c.name;
  document.getElementById('config-provider').value = c.provider;
  document.getElementById('config-api-key').value  = '';
  document.getElementById('config-base-url').value = c.base_url || '';
  document.getElementById('config-model').value    = c.model;
  document.getElementById('modal-config-title').textContent = 'Edit LLM Config';
  toggleBaseUrl();
  openModal('modal-config');
}

async function deleteConfig(id) {
  if (!confirm('Delete this config? Jobs using it will be affected.')) return;
  try {
    await del('/configs/' + id);
    showToast('Config deleted', 'success');
    await loadConfigs();
    populateConfigSelect();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

document.getElementById('form-config').addEventListener('submit', async e => {
  e.preventDefault();
  const id       = document.getElementById('config-id').value;
  const payload  = {
    name:     document.getElementById('config-name').value.trim(),
    provider: document.getElementById('config-provider').value,
    api_key:  document.getElementById('config-api-key').value.trim(),
    base_url: document.getElementById('config-base-url').value.trim() || undefined,
    model:    document.getElementById('config-model').value.trim(),
  };
  // api_key is optional on edit (keep existing if blank)
  if (id && !payload.api_key) delete payload.api_key;
  try {
    if (id) {
      await put('/configs/' + id, payload);
      showToast('Config updated', 'success');
    } else {
      await post('/configs', payload);
      showToast('Config created', 'success');
    }
    closeModal('modal-config');
    await loadConfigs();
    populateConfigSelect();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ── Jobs ─────────────────────────────────────────────────────────────────────

async function loadJobs() {
  jobs = await get('/jobs');
  renderJobs();
}

function renderJobs() {
  const el = document.getElementById('jobs-list');
  if (!jobs.length) {
    el.innerHTML = '<p class="empty-state">No jobs yet. Create one to get started.</p>';
    return;
  }
  el.innerHTML = jobs.map(j => `
    <div class="card">
      <div class="card-title">
        <span class="badge ${j.enabled ? 'badge-enabled' : 'badge-disabled'}">${j.enabled ? 'on' : 'off'}</span>
        ${escHtml(j.name)}
      </div>
      ${j.description ? `<div class="card-meta">${escHtml(j.description)}</div>` : ''}
      <div class="card-meta">
        <span>⏰ ${escHtml(j.cron_expression)}</span>
        <span>🤖 ${escHtml(j.config_name || '')} (${escHtml(j.provider || '')})</span>
      </div>
      <div class="card-actions">
        <button class="btn btn-success btn-sm" data-action="run-job" data-id="${escAttr(j.id)}">▶ Run Now</button>
        <button class="btn btn-secondary btn-sm" data-action="edit-job" data-id="${escAttr(j.id)}">Edit</button>
        <button class="btn btn-warning btn-sm" data-action="toggle-job" data-id="${escAttr(j.id)}" data-enabled="${j.enabled ? '1' : '0'}">${j.enabled ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-job" data-id="${escAttr(j.id)}">Delete</button>
      </div>
    </div>
  `).join('');
}

function populateConfigSelect() {
  const sel = document.getElementById('job-config');
  sel.innerHTML = configs.map(c => `<option value="${escAttr(c.id)}">${escHtml(c.name)} (${escHtml(c.provider)})</option>`).join('');
}

document.getElementById('btn-new-job').addEventListener('click', () => {
  document.getElementById('job-id').value = '';
  document.getElementById('form-job').reset();
  document.getElementById('job-enabled').checked = true;
  document.getElementById('modal-job-title').textContent = 'New Job';
  populateConfigSelect();
  openModal('modal-job');
});

function editJob(id) {
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  document.getElementById('job-id').value          = j.id;
  document.getElementById('job-name').value        = j.name;
  document.getElementById('job-description').value = j.description || '';
  document.getElementById('job-prompt').value      = j.prompt;
  document.getElementById('job-cron').value        = j.cron_expression;
  document.getElementById('job-enabled').checked   = !!j.enabled;
  populateConfigSelect();
  document.getElementById('job-config').value = j.llm_config_id;
  document.getElementById('modal-job-title').textContent = 'Edit Job';
  openModal('modal-job');
}

async function toggleJob(id, currentEnabled) {
  try {
    await put('/jobs/' + id, { enabled: !currentEnabled });
    showToast(`Job ${currentEnabled ? 'disabled' : 'enabled'}`, 'success');
    await loadJobs();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteJob(id) {
  if (!confirm('Delete this job and its run history?')) return;
  try {
    await del('/jobs/' + id);
    showToast('Job deleted', 'success');
    await loadJobs();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function runJobNow(id) {
  showToast('Running job…');
  try {
    const run = await post('/jobs/' + id + '/run');
    showToast(`Job finished: ${run.status}`, run.status === 'success' ? 'success' : 'error');
    document.getElementById('result-content').textContent =
      run.result || run.error || '(no output)';
    openModal('modal-result');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

document.getElementById('form-job').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('job-id').value;
  const payload = {
    name:           document.getElementById('job-name').value.trim(),
    description:    document.getElementById('job-description').value.trim() || null,
    prompt:         document.getElementById('job-prompt').value.trim(),
    cron_expression:document.getElementById('job-cron').value.trim(),
    llm_config_id:  document.getElementById('job-config').value,
    enabled:        document.getElementById('job-enabled').checked,
  };
  try {
    if (id) {
      await put('/jobs/' + id, payload);
      showToast('Job updated', 'success');
    } else {
      await post('/jobs', payload);
      showToast('Job created', 'success');
    }
    closeModal('modal-job');
    await loadJobs();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ── History ──────────────────────────────────────────────────────────────────

async function loadHistory() {
  const jobId = document.getElementById('history-job-filter').value;
  const url   = '/runs' + (jobId ? '?job_id=' + encodeURIComponent(jobId) : '');
  const runs  = await get(url);
  renderHistory(runs);
}

function renderHistory(runs) {
  currentRuns = runs;
  const el = document.getElementById('history-list');
  if (!runs.length) {
    el.innerHTML = '<p class="empty-state">No runs found.</p>';
    return;
  }
  el.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Job</th>
          <th>Started</th>
          <th>Duration</th>
          <th>Status</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        ${runs.map((r, i) => {
          const duration = r.completed_at
            ? ((new Date(r.completed_at) - new Date(r.started_at)) / 1000).toFixed(1) + 's'
            : '–';
          return `
            <tr>
              <td>${escHtml(r.job_name)}</td>
              <td>${fmtDate(r.started_at)}</td>
              <td>${duration}</td>
              <td><span class="status-badge status-${escHtml(r.status)}">${escHtml(r.status)}</span></td>
              <td>
                ${r.result || r.error
                  ? `<button class="btn btn-secondary btn-sm" data-action="view-result" data-run-index="${i}">View</button>`
                  : '–'}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function showResult(text) {
  document.getElementById('result-content').textContent = text;
  openModal('modal-result');
}

document.getElementById('btn-refresh-history').addEventListener('click', loadHistory);
document.getElementById('history-job-filter').addEventListener('change', loadHistory);

function populateJobFilter() {
  const sel = document.getElementById('history-job-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All jobs</option>' +
    jobs.map(j => `<option value="${escAttr(j.id)}" ${j.id === cur ? 'selected' : ''}>${escHtml(j.name)}</option>`).join('');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString();
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadConfigs();
  await loadJobs();
  populateJobFilter();
}

init().catch(e => showToast(e.message, 'error'));
