import {
  FIELD_LABELS, FIELD_KEYS, validateCitizen, validateCase,
  extractOcrCandidates, interpretPortalError, formatINR, maskIdentifier, buildApplicationPayload
} from './core.js';
import { deriveVaultKey, encryptVault, decryptVault, base64ToBytes } from './vault.js';

const VAULT_KEY = 'sevadesk.vault.v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const text = value => String(value ?? '').trim();
const nowISO = () => new Date().toISOString();
const makeId = (prefix = 'ID') => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 5)}`;
const dateShort = value => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const dateTime = value => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const dollars = n => Number.isFinite(Number(n)) ? Number(n) : 0;

let vaultKey = null;
let vaultData = null;
let currentPage = 'overview';
let editingCitizenId = null;
let editingServiceId = null;
let selectedApplicationId = null;
let currentOCR = { file: null, text: '', candidates: [] };
let currentCaseFiles = [];
let toastTimer = null;
let debounceSearchTimer = null;
let autoLockTimer = null;

function getEnvelope() {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY) || 'null'); } catch { return null; }
}

function initialData(operatorName, centreName) {
  return {
    schemaVersion: 1,
    profile: { operatorName, centreName, language: 'hi-IN', createdAt: nowISO() },
    citizens: [],
    services: [],
    applications: [],
    audit: [{ id: makeId('EVT'), timestamp: nowISO(), action: 'workspace_created', description: 'Encrypted local workspace created.', entityType: 'workspace', entityId: 'local' }],
    settings: { autoLockMinutes: 15, version: 1 }
  };
}

async function persist() {
  if (!vaultKey || !vaultData) return;
  const envelope = await encryptVault(vaultData, vaultKey, base64ToBytes(getEnvelope().salt));
  localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
}

function audit(action, description, entityType = 'workspace', entityId = 'local') {
  vaultData.audit.unshift({ id: makeId('EVT'), timestamp: nowISO(), action, description, entityType, entityId });
  if (vaultData.audit.length > 5000) vaultData.audit.length = 5000;
}

function showToast(message, type = 'success') {
  const region = $('#toastRegion');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.innerHTML = `<span class="toast-check">${type === 'error' ? '!' : '✓'}</span><span>${esc(message)}</span>`;
  region.appendChild(toast);
  while (region.children.length > 4) region.firstElementChild.remove();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 3600);
}

function setLockMode(isSetup) {
  $('#setupFields').classList.toggle('hidden', !isSetup);
  $('#confirmWrap').classList.toggle('hidden', !isSetup);
  $('#operatorName').required = isSetup;
  $('#centreName').required = isSetup;
  $('#passphraseConfirm').required = isSetup;
  $('#lockTitle').textContent = isSetup ? 'Set up your secure workspace' : 'Welcome back';
  $('#lockSub').textContent = isSetup
    ? 'Your records stay on this device, encrypted with your passphrase. There is no sample citizen data.'
    : 'Enter your passphrase to decrypt this browser’s local workspace.';
  $('#unlockButton').innerHTML = isSetup ? 'Create encrypted workspace <span>→</span>' : 'Unlock workspace <span>→</span>';
  $('#passphrase').autocomplete = isSetup ? 'new-password' : 'current-password';
}

function showLockedScreen() {
  clearTimeout(autoLockTimer);
  vaultKey = null;
  vaultData = null;
  $('#appShell').classList.add('hidden');
  $('#lockScreen').classList.remove('hidden');
  $('#unlockForm').reset();
  $('#lockError').classList.add('hidden');
  setLockMode(!getEnvelope());
}

function unlockWorkspace() {
  $('#unlockForm').addEventListener('submit', async event => {
    event.preventDefault();
    const passphrase = $('#passphrase').value;
    const envelope = getEnvelope();
    const isSetup = !envelope;
    const errorEl = $('#lockError');
    errorEl.classList.add('hidden');
    const button = $('#unlockButton');
    button.disabled = true;
    button.textContent = isSetup ? 'Creating encrypted workspace…' : 'Unlocking…';
    try {
      if (!window.crypto?.subtle) throw new Error('This browser does not support encrypted local storage here. Run the included local server and open its localhost/127.0.0.1 URL; do not open the file directly.');
      if (isSetup) {
        if (passphrase.length < 10) throw new Error('Use a passphrase of at least 10 characters.');
        if (passphrase !== $('#passphraseConfirm').value) throw new Error('The passphrases do not match.');
        const name = text($('#operatorName').value);
        const centre = text($('#centreName').value);
        if (!name || !centre) throw new Error('Enter both the operator and centre name.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveVaultKey(passphrase, salt);
        const data = initialData(name, centre);
        const newEnvelope = await encryptVault(data, key, salt);
        localStorage.setItem(VAULT_KEY, JSON.stringify(newEnvelope));
        vaultKey = key;
        vaultData = data;
      } else {
        const decrypted = await decryptVault(envelope, passphrase);
        vaultKey = decrypted.key;
        vaultData = decrypted.data;
      }
      // Do not leave the passphrase sitting in a hidden form after the vault is unlocked.
      $('#passphrase').value = '';
      $('#passphraseConfirm').value = '';
      $('#lockScreen').classList.add('hidden');
      $('#appShell').classList.remove('hidden');
      syncProfileChrome();
      renderPage();
      updateFooterDate();
      if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
      scheduleAutoLock();
      if (isSetup) showToast('Encrypted workspace created. Add your first citizen to begin.');
    } catch (error) {
      console.error('Workspace unlock failed', error);
      errorEl.textContent = isSetup ? error.message : 'Unable to decrypt this workspace. Check your passphrase and try again.';
      errorEl.classList.remove('hidden');
      $('#passphrase').focus();
    } finally {
      button.disabled = false;
      button.innerHTML = isSetup ? 'Create encrypted workspace <span>→</span>' : 'Unlock workspace <span>→</span>';
    }
  });
}

function syncProfileChrome() {
  const profile = vaultData.profile || {};
  $('#centreLabel').textContent = profile.centreName || 'Service centre';
  $('#operatorLabel').textContent = profile.operatorName || 'Operator';
  $('#operatorInitial').textContent = (profile.operatorName || 'O').trim().slice(0, 1).toUpperCase();
  updateNavCount();
}

function updateNavCount() {
  $('#navAppCount').textContent = String(vaultData?.applications?.length || 0);
}

function updateFooterDate() {
  $('#footerDate').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
}

function citizenById(id) { return vaultData.citizens.find(c => c.id === id); }
function serviceById(id) { return vaultData.services.find(s => s.id === id); }
function applicationById(id) { return vaultData.applications.find(a => a.id === id); }
function displayStatus(status) {
  const map = { draft: ['Draft', 'draft'], needs_correction: ['Needs correction', 'attention'], ready: ['Ready for review', 'ready'], in_portal: ['In portal', 'submitted'], submitted: ['Submitted', 'submitted'], rejected: ['Rejected', 'rejected'], closed: ['Closed', 'draft'] };
  const item = map[status] || [status || 'Unknown', 'draft'];
  return `<span class="status-pill ${item[1]}"><span>•</span>${esc(item[0])}</span>`;
}
function initials(name) {
  const parts = text(name).split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}
function isFeeVerified(service) { return service?.officialFee != null && service?.operatorCharge != null && Boolean(service?.feeSourceUrl) && Boolean(service?.feeVerifiedAt); }
function serviceFeeTotal(service) {
  if (service?.officialFee == null || service?.operatorCharge == null) return null;
  return dollars(service.officialFee) + dollars(service.operatorCharge);
}
function currentCaseCitizen(app) { return app ? citizenById(app.citizenId) : null; }

function navigate(page) {
  currentPage = page;
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page || (page === 'applicationDetail' && btn.dataset.page === 'applications')));
  renderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const PAGE_TITLES = {
  overview: 'Overview', intake: 'Citizen intake', applications: 'Applications', applicationDetail: 'Application review',
  fees: 'Fee transparency', services: 'Services & rules', audit: 'Audit trail'
};

function renderPage() {
  if (!vaultData) return;
  $('#breadcrumbTitle').textContent = PAGE_TITLES[currentPage] || 'Workspace';
  let content = '';
  if (currentPage === 'overview') content = renderOverview();
  else if (currentPage === 'intake') content = renderIntake();
  else if (currentPage === 'applications') content = renderApplications();
  else if (currentPage === 'applicationDetail') content = renderApplicationDetail();
  else if (currentPage === 'fees') content = renderFees();
  else if (currentPage === 'services') content = renderServices();
  else if (currentPage === 'audit') content = renderAudit();
  else content = renderOverview();
  $('#pageContent').innerHTML = content;
  updateNavCount();
}

function renderOverviewCitizenRegister() {
  const citizens = [...vaultData.citizens].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,5);
  const body = citizens.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Citizen</th><th>Contact</th><th>District</th><th>Last updated</th><th></th></tr></thead><tbody>${citizens.map(c=>`<tr><td><div style="display:flex;align-items:center"><span class="mini-avatar">${esc(initials(c.fullName).toUpperCase())}</span><div><div class="table-primary">${esc(c.fullName)}</div><div class="table-secondary">${esc(c.id)}</div></div></div></td><td>${esc(c.mobile || '—')}</td><td>${esc(c.district || '—')}</td><td>${dateShort(c.updatedAt)}</td><td><button class="button button-secondary button-xs" data-action="edit-citizen" data-id="${esc(c.id)}">Edit</button> <button class="button button-quiet button-xs" data-action="create-case-for-citizen" data-id="${esc(c.id)}">＋ Case</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><div class="empty-illustration">♙</div><h3>No citizen records yet</h3><p>Records appear only after an operator captures real citizen information and records consent.</p><button class="button button-secondary" data-page="intake">Create first record</button></div>`;
  return `<div class="section-header"><div><h2>Citizen register</h2><p>${vaultData.citizens.length} record(s) stored in the encrypted vault · recent 5 shown</p></div><button class="text-link" data-page="intake">＋ Add citizen</button></div><section class="panel">${body}</section>`;
}

function renderOverview() {
  const citizens = vaultData.citizens.length;
  const apps = vaultData.applications;
  const active = apps.filter(a => !['submitted', 'rejected', 'closed'].includes(a.status)).length;
  const ready = apps.filter(a => a.status === 'ready').length;
  const attention = apps.filter(a => a.status === 'needs_correction' || a.status === 'rejected').length;
  const recent = [...apps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const recentRows = recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Citizen / application</th><th>Service</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${recent.map(app => {
    const citizen = citizenById(app.citizenId); const service = serviceById(app.serviceId);
    return `<tr><td><div class="table-primary">${esc(citizen?.fullName || 'Citizen record unavailable')}</div><div class="table-secondary">${esc(app.id)}</div></td><td>${esc(service?.name || 'Service unavailable')}</td><td>${displayStatus(app.status)}</td><td>${dateShort(app.updatedAt)}</td><td><button class="button button-secondary button-xs" data-action="open-case" data-id="${esc(app.id)}">Review</button></td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="empty-state"><div class="empty-illustration">▤</div><h3>Your application queue is clear</h3><p>Applications created from real citizen records will appear here. Nothing has been preloaded.</p><button class="button button-secondary" data-action="new-application">Create an application</button></div>`;
  const workflow = [
    ['01', 'Create a citizen record', 'Scan a card or enter the details. Confirm each field with the citizen.', 'intake', citizens > 0 ? 'Add another' : 'Start intake'],
    ['02', 'Configure the service', 'Add the official portal URL, required fields, upload limits and fee source.', 'services', 'Review rules'],
    ['03', 'Run preflight validation', 'Resolve formatting issues before opening the official portal.', 'applications', apps.length ? 'Open queue' : 'View queue'],
    ['04', 'Fill, review and submit', 'Use the browser companion, review the filled page, then submit manually.', 'applications', 'Continue']
  ];
  return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> OPERATOR DESK</div><h1>Good work starts with a clean record.</h1><p>Prepare complete applications, catch preventable errors and make every fee visible to the citizen.</p></div><div class="page-head-actions"><button class="button button-secondary" data-page="services">Configure services</button><button class="button button-primary" data-page="intake">＋ Add citizen</button></div></div>
  <div class="stat-grid">
    <article class="stat-card"><div class="stat-top"><span>Citizen records</span><span class="stat-icon">♙</span></div><div class="stat-number">${citizens}</div><div class="stat-caption">Stored in this encrypted vault</div></article>
    <article class="stat-card"><div class="stat-top"><span>Active applications</span><span class="stat-icon">▤</span></div><div class="stat-number">${active}</div><div class="stat-caption">Not yet completed or closed</div></article>
    <article class="stat-card"><div class="stat-top"><span>Passed preflight</span><span class="stat-icon">✓</span></div><div class="stat-number">${ready}</div><div class="stat-caption">Still requires human review</div></article>
    <article class="stat-card"><div class="stat-top"><span>Needs attention</span><span class="stat-icon">⌁</span></div><div class="stat-number">${attention}</div><div class="stat-caption">Correction or portal follow-up</div></article>
  </div>
  <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">Recent applications</div><div class="panel-subtitle">Live records from this device · most recently updated first</div></div><button class="text-link" data-page="applications">View all →</button></div>${recentRows}</section>
  <section class="panel"><div class="panel-head"><div><div class="panel-title">Recommended workflow</div><div class="panel-subtitle">From first contact to verified submission</div></div><span class="pill">4 steps</span></div><div class="panel-body"><div class="workflow">${workflow.map(step => `<div class="workflow-step"><div class="step-number">${step[0]}</div><div><strong>${step[1]}</strong><p>${step[2]}</p></div><button class="step-link" data-page="${step[3]}">${step[4]} →</button></div>`).join('')}</div></div></section></div>
  ${renderOverviewCitizenRegister()}
  <div class="security-strip"><div class="secure-icon">⌑</div><div><strong>Privacy is part of the workflow</strong><p>Citizen records are encrypted with your passphrase and kept in this browser. OCR images and browser payloads are not saved by default. This workspace does not submit to a government portal or verify eligibility.</p></div></div>`;
}

function renderIntake() {
  const editing = editingCitizenId ? citizenById(editingCitizenId) : null;
  const c = editing || {};
  const title = editing ? 'Update citizen record' : 'New citizen record';
  const label = key => FIELD_LABELS[key];
  const inputField = (key, opts = {}) => {
    const value = c[key] ?? '';
    const type = opts.type || 'text';
    const placeholder = opts.placeholder || '';
    const help = opts.help ? `<span class="field-help">${opts.help}</span>` : '';
    const required = opts.required ? 'required' : '';
    if (opts.select) return `<div class="form-field"><label for="${key}">${label(key)}${opts.required ? ' *' : ''}</label><select class="form-control" id="${key}" name="${key}" ${required}><option value="">Choose…</option>${opts.select.map(v => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>${help}</div>`;
    return `<div class="form-field ${opts.full ? 'full' : ''}"><label for="${key}">${label(key)}${opts.required ? ' *' : ''}</label><input class="form-control" id="${key}" name="${key}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required} ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ''} ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : ''}/>${help}</div>`;
  };
  return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> CITIZEN RECORD</div><h1>${title}</h1><p>Capture the source details once. Nothing is treated as verified until a human checks it against the original document.</p></div><div class="page-head-actions"><button class="button button-secondary" data-page="overview">Cancel</button></div></div>
  <form id="citizenForm" class="form-layout" novalidate><input type="hidden" name="id" value="${esc(c.id || '')}" />
    <section class="panel form-panel"><div class="form-section-title"><div class="section-index">1</div><div><h2>Identity & contact</h2><p>Enter only details that the selected service actually needs.</p></div></div>
      <div class="form-grid">${inputField('fullName',{required:true,placeholder:'Name as printed on the source document',full:true,autocomplete:'name',maxlength:120})}${inputField('dob',{type:'date',help:'Use the date on the source document.'})}${inputField('gender',{select:['Male','Female','Transgender','Prefer not to say']})}${inputField('mobile',{type:'tel',placeholder:'10-digit mobile number',help:'Do not use this field to bypass an OTP or verification step.'})}${inputField('email',{type:'email',placeholder:'Optional'})}${inputField('address',{full:true,placeholder:'House / street / village / ward',maxlength:240})}${inputField('state',{placeholder:'State / UT',maxlength:80})}${inputField('district',{placeholder:'District',maxlength:80})}${inputField('pincode',{placeholder:'6-digit PIN code',maxlength:6})}</div>
      <div class="form-divider"></div><div class="form-section-title"><div class="section-index">2</div><div><h2>Identifiers (only when required)</h2><p>Encrypted at rest. The interface masks long identifiers outside this form.</p></div></div>
      <div class="form-grid">${inputField('aadhaar',{type:'password',placeholder:'12 digits — only if required',help:'Sensitive. Confirm consent and portal authority before entering. Prefer masked Aadhaar or permitted alternatives where accepted.'})}${inputField('voterId',{placeholder:'Voter / EPIC ID',maxlength:40})}${inputField('rationCard',{placeholder:'Ration card number',maxlength:50})}${inputField('bankAccount',{type:'password',placeholder:'Only if this service needs it',help:'Avoid collecting bank details before confirming the requirement.'})}${inputField('ifsc',{placeholder:'11-character IFSC'})}</div>
      <div class="form-divider"></div><label class="check-line"><input type="checkbox" name="consent" id="citizenConsent" ${c.consentAt ? 'checked' : ''} required/><span>I have explained why these details are being recorded, obtained the citizen’s consent to assisted-service intake, and will confirm the specific service with them before portal entry.</span></label>
      <div class="field-note" style="margin-top:12px">Data minimisation: save only what is needed for the specific service. This local app is not an Aadhaar verification service and does not authenticate identity.</div>
      <div class="form-actions"><button type="button" class="button button-secondary" data-page="overview">Cancel</button><button type="submit" class="button button-primary">${editing ? 'Save changes' : 'Save encrypted record'} <span>→</span></button></div>
    </section>
    <aside><section class="panel form-panel"><div class="form-section-title"><div class="section-index">↥</div><div><h2>Read a document</h2><p>Optional client-side OCR to reduce retyping.</p></div></div>
      <label class="upload-zone" for="ocrFile"><div class="upload-icon">▧</div><strong>Choose a photo or use the camera</strong><p>JPG, PNG or another browser-readable image.<br/>OCR needs an internet connection to load the OCR engine and language data.</p><input type="file" id="ocrFile" accept="image/*" capture="environment"/><div class="upload-meta" id="uploadMeta">No file selected</div></label>
      <div class="inline-actions" style="margin-top:10px"><button type="button" class="button button-secondary button-sm" id="runOcrButton" disabled>Run on-device OCR</button><span id="ocrProgress" class="small-note"></span></div>
      <div class="ocr-panel"><div class="ocr-head"><strong>Recognised text</strong><span id="ocrState" class="ocr-state">Not run</span></div><div class="ocr-body"><textarea id="ocrText" placeholder="The OCR text will appear here. Review it; OCR can misread names and digits."></textarea><div id="ocrCandidates" class="ocr-candidates"></div><button type="button" class="button button-secondary button-sm" id="applyOcrButton" style="margin-top:10px" disabled>Apply checked values</button></div></div>
      <div class="notice warning" style="margin-top:12px"><span class="notice-icon">!</span><span><strong>Always verify.</strong> OCR suggestions are not facts. The original image is not saved by SevaDesk; only the fields you confirm and save will be retained in the encrypted vault.</span></div>
    </section></aside>
  </form>`;
}

function renderApplications() {
  const apps = [...vaultData.applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = apps.length ? apps.map(app => {
    const citizen = citizenById(app.citizenId); const service = serviceById(app.serviceId);
    return `<tr><td><div class="table-primary">${esc(citizen?.fullName || 'Citizen record unavailable')}</div><div class="table-secondary">${esc(app.id)}</div></td><td><div class="table-primary">${esc(service?.name || 'Service unavailable')}</div><div class="table-secondary">${esc(service?.department || '')}</div></td><td>${displayStatus(app.status)}</td><td>${dateShort(app.createdAt)}</td><td>${app.preflight?.valid ? '<span class="pill" style="color:#2f8554;background:#eaf6ed">Preflight passed</span>' : '<span class="pill">Not validated</span>'}</td><td><button class="button button-secondary button-xs" data-action="open-case" data-id="${esc(app.id)}">Open →</button></td></tr>`;
  }).join('') : '';
  return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> CASE QUEUE</div><h1>Applications</h1><p>Track each application from preparation to the status confirmed on the official portal.</p></div><div class="page-head-actions"><button class="button button-primary" data-action="new-application">＋ New application</button></div></div>
    <section class="panel"><div class="panel-head"><div><div class="panel-title">Application register</div><div class="panel-subtitle">${apps.length} saved record${apps.length === 1 ? '' : 's'} · stored locally, not synced to a government system</div></div><div class="filter-row"><div class="search-wrap"><span class="search-icon">⌕</span><input class="search-input" id="appSearch" placeholder="Search citizen, service or ID"/></div><select id="appStatusFilter" class="filter-select"><option value="all">All statuses</option><option value="draft">Draft</option><option value="needs_correction">Needs correction</option><option value="ready">Ready</option><option value="in_portal">In portal</option><option value="submitted">Submitted</option><option value="rejected">Rejected</option></select></div></div>
    ${apps.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Citizen / reference</th><th>Service</th><th>Status</th><th>Created</th><th>Preflight</th><th></th></tr></thead><tbody id="applicationRows">${rows}</tbody></table></div><div class="pagination-note">Only real records you create are shown. A “submitted” status requires operator confirmation and a portal reference.</div>` : `<div class="empty-state"><div class="empty-illustration">▤</div><h3>No applications have been created</h3><p>Create an application from a citizen record, run the checks, then open the official portal to continue.</p>${vaultData.citizens.length ? '<button class="button button-primary" data-action="new-application">Create first application</button>' : '<button class="button button-primary" data-page="intake">Create a citizen record first</button>'}</div>`}</section>`;
}

function renderApplicationDetail() {
  const app = applicationById(selectedApplicationId);
  if (!app) { currentPage = 'applications'; return renderApplications(); }
  const citizen = currentCaseCitizen(app); const service = serviceById(app.serviceId) || { name: 'Unconfigured service', portalUrl: '', requiredFields: [], maxUploadMB: null, allowedExtensions: [] };
  const required = service.requiredFields || [];
  const validation = app.preflight || null;
  const validNow = validateCase(citizen || {}, service, currentCaseFiles);
  const statusDetail = validation ? (validation.valid ? 'No configured validation errors were found. Warnings still require operator attention.' : `${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'} need correction before portal entry.`) : 'Run a preflight check against this service’s configured rules.';
  const checklist = required.map(key => {
    const exists = Boolean(text(citizen?.[key]));
    return `<div class="check-item ${exists ? 'ok' : ''}"><span class="check-indicator">${exists ? '✓' : '!'}</span><div><strong>${esc(FIELD_LABELS[key] || key)}</strong><p>${exists ? 'Value is present. Confirm it against the source document.' : 'Missing from the citizen record.'}</p></div><span class="check-status">${exists ? 'Present' : 'Missing'}</span></div>`;
  }).join('');
  const errorHTML = validation ? `<div class="divider"></div><div class="overline"><span class="tiny-dot"></span> PREFLIGHT RESULT</div>${validation.errors.length ? `<div class="notice danger"><span class="notice-icon">!</span><span><strong>${validation.errors.length} blocking issue${validation.errors.length === 1 ? '' : 's'}</strong><br/>Resolve these in the citizen record or service rules, then run preflight again.</span></div><div class="checklist">${validation.errors.map(e => `<div class="check-item"><span class="check-indicator">×</span><div><strong>${esc(e.label)}</strong><p>${esc(e.message)}</p></div></div>`).join('')}</div>` : `<div class="notice"><span class="notice-icon">✓</span><span><strong>Configured checks passed.</strong><br/>This is a local preflight only. It cannot guarantee that the government portal will accept the application.</span></div>`}${validation.warnings?.length ? `<div class="checklist">${validation.warnings.map(e => `<div class="check-item"><span class="check-indicator">!</span><div><strong>${esc(e.label)}</strong><p>${esc(e.message)}</p></div></div>`).join('')}</div>` : ''}` : '';
  const portalUrl = service.portalUrl ? esc(service.portalUrl) : '';
  return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> APPLICATION REVIEW</div><h1>${esc(service.name || 'Application')}</h1><p>${esc(app.id)} · Created ${dateShort(app.createdAt)} · Updated ${dateTime(app.updatedAt)}</p></div><div class="page-head-actions"><button class="button button-secondary" data-page="applications">← All applications</button><button class="button button-secondary" data-action="copy-payload" data-id="${esc(app.id)}" ${app.preflight?.valid ? '' : 'disabled title="Run and pass preflight first"'}>Copy fill payload</button></div></div>
  <div class="detail-grid"><div class="stack-column"><section class="panel detail-card"><div class="detail-title-row"><div><h2>Applicant details</h2><p>Cross-check with the original documents before using the portal.</p></div>${displayStatus(app.status)}</div>
    ${citizen ? `<div class="key-value-grid">${[['Full name', citizen.fullName],['Date of birth', citizen.dob ? dateShort(`${citizen.dob}T00:00:00`) : 'Not provided'],['Gender', citizen.gender],['Mobile', citizen.mobile],['Aadhaar', citizen.aadhaar ? maskIdentifier(citizen.aadhaar) : 'Not provided'],['Voter ID', citizen.voterId ? maskIdentifier(citizen.voterId) : 'Not provided'],['Address', citizen.address],['State / District', [citizen.state,citizen.district].filter(Boolean).join(' / ')],['PIN code', citizen.pincode],['Bank account', citizen.bankAccount ? maskIdentifier(citizen.bankAccount) : 'Not provided'],['IFSC', citizen.ifsc]].map(([k,v]) => `<div class="key-value"><dt>${esc(k)}</dt><dd class="${v ? '' : 'muted'}">${esc(v || 'Not provided')}</dd></div>`).join('')}</div><div class="divider"></div><button class="button button-secondary button-sm" data-action="edit-citizen" data-id="${esc(citizen.id)}">Edit citizen record</button>` : '<div class="notice danger">The linked citizen record is unavailable. Review the case before proceeding.</div>'}</section>
    <section class="panel detail-card" style="margin-top:16px"><div class="detail-title-row"><div><h2>Required-field checklist</h2><p>Based on the service rules currently saved by this operator.</p></div><span class="pill">${required.length} configured</span></div><div class="progress-line"><span style="width:${required.length ? Math.round(required.filter(k => text(citizen?.[k])).length / required.length * 100) : 0}%"></span></div><div class="small-note">${required.filter(k => text(citizen?.[k])).length} of ${required.length} required fields are present. Presence does not mean accuracy.</div><div class="checklist">${checklist || '<div class="notice warning">No required fields are configured. Edit the service rules before using this workflow.</div>'}</div>
    <div class="form-actions"><button class="button button-primary" data-action="preflight" data-id="${esc(app.id)}">Run preflight validation</button></div>${errorHTML}</section>
    <section class="panel detail-card" style="margin-top:16px"><div class="detail-title-row"><div><h2>Portal error interpreter</h2><p>Rule-based hints for common messages. Unknown errors stay unknown.</p></div><span class="pill">Local rules</span></div><div class="error-interpreter" style="margin-top:14px"><form id="interpretErrorForm" data-case-id="${esc(app.id)}"><label class="field-label" for="portalErrorText">Paste the exact technical message (remove personal data)</label><textarea id="portalErrorText" placeholder="Example: File size exceeded limit"></textarea><div class="form-actions"><button type="submit" class="button button-secondary button-sm">Interpret message</button></div></form><div id="errorInterpretation" class="interpretation-result"></div></div></section>
  </div><div class="stack-column"><section class="panel detail-card"><div class="detail-title-row"><div><h2>Next actions</h2><p>${esc(statusDetail)}</p></div></div><div class="case-flow" style="margin-top:13px">${[['1','Validate fields','Check required values, formats and configured file limits.'],['2','Open official portal','Sign in through the portal’s normal process.'],['3','Fill and review','Use the browser companion and inspect every populated field.'],['4','Submit manually','Handle OTP/CAPTCHA yourself and submit only after citizen review.']].map((s,i)=>`<div class="case-flow-step ${validation?.valid && i===0 ? 'done' : ''}"><div class="flow-bullet">${validation?.valid && i===0 ? '✓' : s[0]}</div><div><strong>${s[1]}</strong><p>${s[2]}</p></div></div>`).join('')}</div><div class="divider"></div><div class="field-label">Official portal</div>${portalUrl ? `<a href="${portalUrl}" class="button button-secondary" target="_blank" rel="noopener noreferrer" style="width:100%;margin-top:9px">Open ${esc(service.name)} portal ↗</a>` : `<div class="notice warning" style="margin-top:9px"><span class="notice-icon">!</span><span>The official portal URL is not configured. Add it to service settings after verifying the domain.</span></div>`}<div class="notice" style="margin-top:12px"><span class="notice-icon">i</span><span>The companion does not click Submit, bypass login controls, automate OTP/CAPTCHA, or claim portal success.</span></div></section>
  <section class="panel detail-card" style="margin-top:16px"><div class="detail-title-row"><div><h2>Document pre-check</h2><p>Choose local files to check type and size. Files are not retained.</p></div></div><label class="upload-zone" for="caseDocumentsInput" style="display:block;margin-top:13px"><div class="upload-icon">＋</div><strong>Choose application documents</strong><p>For rule checks only; you will select documents again on the official portal.</p><input type="file" id="caseDocumentsInput" multiple accept=".pdf,.jpg,.jpeg,.png"/><div class="upload-meta">${currentCaseFiles.length ? `${currentCaseFiles.length} file(s) selected for this session` : 'No files selected'}</div></label>${currentCaseFiles.length ? `<div class="checklist">${currentCaseFiles.map(file => `<div class="check-item"><span class="check-indicator">▧</span><div><strong>${esc(file.name)}</strong><p>${(file.size/1024).toFixed(1)} KB · ${esc(file.type || 'Unknown MIME type')}</p></div></div>`).join('')}</div>` : ''}<div class="small-note" style="margin-top:9px">Configured limits: ${service.maxUploadMB != null ? `${esc(service.maxUploadMB)} MB per file` : 'maximum size not configured'} · ${(service.allowedExtensions || []).map(v=>'.'+esc(v)).join(', ') || 'file types not configured'}.</div></section>
  <section class="panel detail-card" style="margin-top:16px"><div class="detail-title-row"><div><h2>Update verified status</h2><p>State changes are operator-entered and added to the audit trail.</p></div></div><div class="inline-actions" style="margin-top:13px"><button class="button button-secondary button-sm" data-action="change-status" data-id="${esc(app.id)}">Change status</button>${app.receiptRef ? `<span class="small-note">Portal reference: ${esc(app.receiptRef)}</span>` : ''}</div></section>
  </div></div>`;
}

function renderFees() {
  if (!vaultData.services.length) return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> CITIZEN VISIBILITY</div><h1>Fee transparency</h1><p>Fee amounts are never guessed or preloaded.</p></div><div class="page-head-actions"><button class="button button-primary" data-action="new-service">＋ Configure a real service</button></div></div><section class="panel"><div class="empty-state"><div class="empty-illustration">₹</div><h3>No service or fee has been configured</h3><p>Add a real service, then enter its fee only after checking an official source. No official fee or operator charge is assumed.</p><button class="button button-primary" data-action="new-service">Add service rules</button></div></section>`;
  const serviceId = vaultData.services.some(s => s.id === window.activeFeeServiceId) ? window.activeFeeServiceId : vaultData.services[0]?.id;
  window.activeFeeServiceId = serviceId;
  const service = serviceById(serviceId);
  const selectedApp = applicationById(window.activeFeeApplicationId);
  const citizen = selectedApp ? currentCaseCitizen(selectedApp) : null;
  const official = service.officialFee == null ? null : dollars(service.officialFee);
  const charge = service.operatorCharge == null ? null : dollars(service.operatorCharge);
  const total = official != null && charge != null ? official + charge : null;
  const verified = isFeeVerified(service);
  const selectedAppId = selectedApp?.id || '';
  return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> CITIZEN VISIBILITY</div><h1>Fee transparency</h1><p>Show the official charge and operator service charge separately. Never invent or guess an official fee.</p></div><div class="page-head-actions"><button class="button button-secondary" data-action="open-fee-settings">Configure fee source</button></div></div>
    <div class="detail-grid"><section><div class="panel detail-card"><div class="detail-title-row"><div><h2>Citizen-facing fee display</h2><p>Choose a configured service and optional application record.</p></div>${verified ? '<span class="status-pill ready">Operator verified</span>' : '<span class="status-pill attention">Needs verification</span>'}</div>
      <div class="form-grid" style="margin-top:18px"><div class="form-field"><label for="feeServiceSelect">Service</label><select id="feeServiceSelect" class="form-control">${vaultData.services.map(s=>`<option value="${esc(s.id)}" ${s.id===serviceId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="form-field"><label for="feeApplicationSelect">Citizen / application (optional)</label><select id="feeApplicationSelect" class="form-control"><option value="">Public display only</option>${vaultData.applications.map(a=>{const c=citizenById(a.citizenId);return `<option value="${esc(a.id)}" ${a.id===selectedAppId?'selected':''}>${esc(c?.fullName||'Citizen')} · ${esc(a.id)}</option>`}).join('')}</select></div></div>
      <div class="divider"></div><div class="receipt-screen" id="receiptPanel"><div class="receipt-header"><div class="receipt-mark">S</div><strong>Fee disclosure</strong><p>${esc(vaultData.profile.centreName || 'Service centre')}</p></div><div class="receipt-body"><div class="receipt-row"><span>Citizen</span><strong>${esc(citizen?.fullName || 'Not selected')}</strong></div><div class="receipt-row"><span>Service</span><strong>${esc(service.name)}</strong></div><div class="receipt-row"><span>Government / portal fee</span><strong>${official == null ? 'Not configured' : formatINR(official)}</strong></div><div class="receipt-row"><span>Operator service charge</span><strong>${charge == null ? 'Not configured' : formatINR(charge)}</strong></div><div class="receipt-row total"><span>Total payable</span><strong>${total == null ? '—' : formatINR(total)}</strong></div><div class="receipt-row"><span>Fee source last checked</span><strong>${esc(service.feeVerifiedAt ? dateShort(service.feeVerifiedAt) : 'Not recorded')}</strong></div></div><div class="receipt-foot">This is a service-fee disclosure from the operator, not a government receipt or proof of payment. Amounts must be checked against the official portal before collection.</div></div>
      <div class="inline-actions no-print" style="margin-top:13px"><button class="button button-primary" data-action="citizen-display">Open citizen view</button><button class="button button-secondary" data-action="speak-fees">🔊 Read aloud</button><button class="button button-secondary" data-action="print-receipt">Print disclosure</button></div>
      ${!verified ? `<div class="notice warning" style="margin-top:14px"><span class="notice-icon">!</span><span><strong>Fee is not confirmed.</strong> Official fee/source/date details are incomplete. Do not quote the total as verified or collect an amount based on this screen until the fee is checked and configured.</span></div>` : `<div class="notice" style="margin-top:14px"><span class="notice-icon">✓</span><span>Marked verified by the operator on ${dateShort(service.feeVerifiedAt)}. This is an operator declaration, not an automatic government fee lookup.</span></div>`}
    </div></section><section class="panel detail-card"><div class="detail-title-row"><div><h2>Trust checklist</h2><p>Make the fee interaction visible and understandable.</p></div></div><div class="workflow" style="margin-top:12px">${[['1','Show both line items','Never combine the government fee and the operator charge into one unexplained number.'],['2','Show the source','Keep a link to the official fee page and record when the operator checked it.'],['3','Read it aloud','Use the configured browser voice so low-literacy citizens can hear the amount.'],['4','Give a copy','Print the disclosure. It is not a receipt for payment or an official transaction acknowledgement.']].map(s=>`<div class="workflow-step"><div class="step-number">${s[0]}</div><div><strong>${s[1]}</strong><p>${s[2]}</p></div></div>`).join('')}</div>${service.feeSourceUrl?`<div class="divider"></div><div class="field-label">Configured fee source</div><a href="${esc(service.feeSourceUrl)}" target="_blank" rel="noopener noreferrer" class="subtle-link" style="display:inline-block;margin-top:9px;word-break:break-all">${esc(service.feeSourceUrl)} ↗</a>`:''}</section></div>`;
}

function renderServices() {
  const services = vaultData.services;
  const cards = services.map(service => {
    const verified = isFeeVerified(service);
    return `<article class="service-card"><div class="service-card-head"><div class="service-symbol">▧</div><div><h3>${esc(service.name)}</h3><p>${esc(service.department || 'Department not specified')}</p></div></div><div class="service-meta"><span class="meta-chip">${(service.requiredFields || []).length} required fields</span><span class="meta-chip">${service.maxUploadMB != null ? `${esc(service.maxUploadMB)} MB max / file` : 'Max file size not configured'}</span><span class="meta-chip ${verified?'verified':'unverified'}">${verified?'Fee source recorded':'Fee unverified'}</span></div><div class="service-meta"><span class="meta-chip">Portal ${service.portalUrl ? 'configured' : 'missing'}</span><span class="meta-chip">${(service.allowedExtensions||[]).length ? service.allowedExtensions.map(v=>'.'+esc(v)).join(' ') : 'File types not configured'}</span></div><div class="service-card-actions"><button class="button button-secondary button-xs" data-action="edit-service" data-id="${esc(service.id)}">Edit rules</button><button class="button button-quiet button-xs" data-action="edit-service-fees" data-id="${esc(service.id)}">Fee setup</button>${service.portalUrl?`<a class="button button-quiet button-xs" href="${esc(service.portalUrl)}" target="_blank" rel="noopener noreferrer">Open portal ↗</a>`:''}</div></article>`;
  }).join('');
  const serviceContent = services.length ? `<div class="service-grid">${cards}</div>` : `<section class="panel"><div class="empty-state"><div class="empty-illustration">▧</div><h3>No services configured yet</h3><p>Start with a real portal you use at this centre. Add only field rules, upload limits and fees confirmed from that portal’s official source.</p><button class="button button-primary" data-action="new-service">Configure the first service</button></div></section>`;
  return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> CONFIGURATION</div><h1>Services & rules</h1><p>Every saved service must be configured from a real portal. No scheme or fee is preloaded.</p></div><div class="page-head-actions"><button class="button button-secondary" data-action="export-backup">Export encrypted backup</button><button class="button button-primary" data-action="new-service">＋ Add service</button></div></div>
  <div class="notice warning" style="margin-bottom:17px"><span class="notice-icon">!</span><span><strong>Portal rules change.</strong> Inspect the official application form and configure only the required fields, accepted document types, size limits and official fee source you have confirmed. These settings are not fetched or certified automatically.</span></div>
  ${serviceContent}
  <div class="section-header"><div><h2>Workspace profile</h2><p>Used for the sidebar and fee disclosures.</p></div></div><section class="panel"><div class="panel-body"><form id="profileForm" class="modal-form-grid"><div class="form-field"><label for="profileOperator">Operator name</label><input class="form-control" id="profileOperator" name="operatorName" value="${esc(vaultData.profile.operatorName || '')}" required/></div><div class="form-field"><label for="profileCentre">Centre name</label><input class="form-control" id="profileCentre" name="centreName" value="${esc(vaultData.profile.centreName || '')}" required/></div><div class="form-field"><label for="profileLanguage">Citizen audio language</label><select class="form-control" id="profileLanguage" name="language"><option value="hi-IN" ${vaultData.profile.language==='hi-IN'?'selected':''}>Hindi</option><option value="en-IN" ${vaultData.profile.language==='en-IN'?'selected':''}>English (India)</option><option value="mr-IN" ${vaultData.profile.language==='mr-IN'?'selected':''}>Marathi</option><option value="bn-IN" ${vaultData.profile.language==='bn-IN'?'selected':''}>Bengali</option><option value="gu-IN" ${vaultData.profile.language==='gu-IN'?'selected':''}>Gujarati</option><option value="ta-IN" ${vaultData.profile.language==='ta-IN'?'selected':''}>Tamil</option><option value="te-IN" ${vaultData.profile.language==='te-IN'?'selected':''}>Telugu</option></select></div><div class="form-field"><label for="autoLockMinutes">Auto-lock after inactivity (minutes)</label><select class="form-control" id="autoLockMinutes" name="autoLockMinutes"><option value="5" ${vaultData.settings.autoLockMinutes===5?'selected':''}>5 minutes</option><option value="15" ${vaultData.settings.autoLockMinutes===15?'selected':''}>15 minutes</option><option value="30" ${vaultData.settings.autoLockMinutes===30?'selected':''}>30 minutes</option><option value="60" ${vaultData.settings.autoLockMinutes===60?'selected':''}>60 minutes</option></select></div><div class="full inline-actions" style="justify-content:flex-end"><button class="button button-primary" type="submit">Save profile</button></div></form><div class="divider"></div><div class="config-row"><div><strong>Encrypted workspace backup</strong><p>Download a copy of the encrypted vault. The file remains encrypted and still needs your passphrase. Keep it private.</p></div><button class="button button-secondary button-sm" data-action="export-backup">Download backup</button></div><div class="config-row"><div><strong>Lock this workspace</strong><p>Clear the decryption key from memory. You must unlock it again with your passphrase.</p></div><button class="button button-secondary button-sm" data-action="lock">Lock now</button></div></div></section>
  <div class="footer-legal">SevaDesk is an independent local workspace, not an official government portal or CSC certification tool. Confirm legal, policy, fee and data-protection requirements before operational deployment.</div>`;
}

function renderAudit() {
  const rows = vaultData.audit || [];
  return `<div class="page-head"><div><div class="overline"><span class="tiny-dot"></span> ACCOUNTABILITY</div><h1>Audit trail</h1><p>Local event history for case workflow and operator actions. Sensitive field values are intentionally not written to event descriptions.</p></div><div class="page-head-actions"><button class="button button-secondary" data-action="export-audit">Export CSV</button></div></div>
  <section class="panel"><div class="panel-head"><div><div class="panel-title">Activity log</div><div class="panel-subtitle">${rows.length} events · newest first · stored inside encrypted vault</div></div><span class="pill">Append-only in app UI</span></div><div class="panel-body"><div class="audit-list">${rows.length ? rows.map(row=>`<div class="audit-row"><div class="audit-symbol">${row.action.includes('validation')?'✓':row.action.includes('fee')?'₹':row.action.includes('citizen')?'♙':row.action.includes('application')?'▤':'·'}</div><div class="audit-content"><strong>${esc(row.description)}</strong><p><span class="audit-id">${esc(row.id)}</span> · ${esc(row.entityType || 'workspace')} · ${esc(row.entityId || 'local')}</p></div><div class="audit-time">${dateTime(row.timestamp)}</div></div>`).join('') : `<div class="empty-state"><div class="empty-illustration">≡</div><h3>No events yet</h3><p>Actions such as creating a record or running preflight will be logged here.</p></div>`}</div></div><div class="pagination-note">The app never logs full Aadhaar numbers, account numbers, OCR text or raw citizen details to this list. This is a local accountability aid, not a tamper-proof external audit system.</div></section>`;
}

function openModal(content, wide = false) {
  $('#modalRoot').innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal-card ${wide?'wide':''}" role="dialog" aria-modal="true">${content}</section></div>`;
  const first = $('input,select,textarea,button', $('#modalRoot .modal-card'));
  if (first) first.focus({ preventScroll: true });
}
function closeModal() { $('#modalRoot').innerHTML = ''; }

function showNewApplicationModal() {
  if (!vaultData.services.length) {
    showToast('Configure the real service and its verified rules before creating an application.', 'error');
    navigate('services');
    return;
  }
  if (!vaultData.citizens.length) {
    showToast('Add a citizen record before creating an application.', 'error');
    editingCitizenId = null;
    navigate('intake');
    return;
  }
  const citizens = vaultData.citizens;
  const services = vaultData.services;
  openModal(`<div class="modal-head"><div><h2>Create application</h2><p>Use a real citizen record and an operator-configured service.</p></div><button class="modal-close" type="button" data-action="close-modal">×</button></div><form id="caseCreateForm"><div class="modal-body"><div class="modal-form-grid"><div class="form-field full"><label for="caseCitizen">Citizen *</label><select id="caseCitizen" name="citizenId" class="form-control" required><option value="">Choose a saved record</option>${citizens.map(c=>`<option value="${esc(c.id)}">${esc(c.fullName)} · ${esc(c.id)}</option>`).join('')}</select></div><div class="form-field full"><label for="caseService">Service *</label><select id="caseService" name="serviceId" class="form-control" required>${services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div></div><div class="notice warning" style="margin-top:15px"><span class="notice-icon">!</span><span>The service’s requirements must be checked against the live official portal. Creating this local record does not submit anything.</span></div></div><div class="modal-foot"><button class="button button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Create application →</button></div></form>`, false);
}

function showServiceModal(service = null) {
  editingServiceId = service?.id || null;
  const s = service || { id: '', name: '', department: '', portalUrl: '', officialFee: null, operatorCharge: null, feeSourceUrl: '', feeVerifiedAt: '', requiredFields: [], maxUploadMB: null, allowedExtensions: [], notes: '' };
  const required = new Set(s.requiredFields || []);
  const fields = FIELD_KEYS.map(key => `<label class="field-option"><input type="checkbox" name="requiredFields" value="${key}" ${required.has(key)?'checked':''}/><span>${esc(FIELD_LABELS[key])}</span></label>`).join('');
  openModal(`<div class="modal-head"><div><h2>${service ? 'Edit service rules' : 'Add service'}</h2><p>Use values observed on the official portal. These rules are not automatically synchronised.</p></div><button class="modal-close" type="button" data-action="close-modal">×</button></div><form id="serviceForm"><div class="modal-body"><div class="modal-form-grid"><div class="form-field full"><label for="serviceName">Service name *</label><input class="form-control" id="serviceName" name="name" maxlength="100" value="${esc(s.name || '')}" required placeholder="Enter the actual service name"/></div><div class="form-field"><label for="serviceDepartment">Department / scheme</label><input class="form-control" id="serviceDepartment" name="department" value="${esc(s.department || '')}" placeholder="Department name"/></div><div class="form-field"><label for="servicePortalUrl">Official portal URL</label><input class="form-control" id="servicePortalUrl" name="portalUrl" type="url" value="${esc(s.portalUrl || '')}" placeholder="https://…"/></div><div class="form-field"><label for="officialFee">Official / portal fee (₹)</label><input class="form-control" id="officialFee" name="officialFee" type="number" min="0" step="0.01" value="${s.officialFee == null ? '' : esc(s.officialFee)}" placeholder="Leave blank if unknown"/></div><div class="form-field"><label for="operatorCharge">Operator service charge (₹)</label><input class="form-control" id="operatorCharge" name="operatorCharge" type="number" min="0" step="0.01" value="${s.operatorCharge == null ? '' : esc(s.operatorCharge)}" placeholder="Leave blank until agreed"/></div><div class="form-field"><label for="feeSourceUrl">Official fee source URL</label><input class="form-control" id="feeSourceUrl" name="feeSourceUrl" type="url" value="${esc(s.feeSourceUrl || '')}" placeholder="Link to official fee rules"/></div><div class="form-field"><label for="feeVerifiedAt">Fee checked on</label><input class="form-control" id="feeVerifiedAt" name="feeVerifiedAt" type="date" value="${esc(s.feeVerifiedAt || '')}"/></div><div class="form-field"><label for="maxUploadMB">Maximum upload size (MB / file)</label><input class="form-control" id="maxUploadMB" name="maxUploadMB" type="number" min="0.1" max="100" step="0.1" value="${s.maxUploadMB == null ? '' : esc(s.maxUploadMB)}" placeholder="Set after checking portal rules"/></div><div class="form-field"><label for="allowedExtensions">Allowed file types (comma-separated)</label><input class="form-control" id="allowedExtensions" name="allowedExtensions" value="${esc((s.allowedExtensions || []).join(', '))}" placeholder="Only file types confirmed by the portal"/></div><div class="form-field full"><label>Required applicant fields</label><div class="field-options">${fields}</div></div><div class="form-field full"><label for="serviceNotes">Notes / operator guidance</label><textarea class="form-control" id="serviceNotes" name="notes" style="height:78px;padding:10px;resize:vertical">${esc(s.notes || '')}</textarea></div></div><div class="notice warning" style="margin-top:15px"><span class="notice-icon">!</span><span>A checked date is the operator’s declaration, not an automatic government lookup. Add field rules and upload constraints only after confirming them on the official portal; blank limits remain unconfigured.</span></div></div><div class="modal-foot"><button class="button button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Save service rules</button></div></form>`, true);
}

function showStatusModal(app) {
  openModal(`<div class="modal-head"><div><h2>Update application status</h2><p>${esc(app.id)} · Choose only what you observed on the real portal.</p></div><button class="modal-close" type="button" data-action="close-modal">×</button></div><form id="statusForm" data-id="${esc(app.id)}"><div class="modal-body"><div class="form-field"><label for="caseStatus">Status</label><select class="form-control" id="caseStatus" name="status" required><option value="draft" ${app.status==='draft'?'selected':''}>Draft</option><option value="needs_correction" ${app.status==='needs_correction'?'selected':''}>Needs correction</option><option value="ready" ${app.status==='ready'?'selected':''}>Ready for review (local preflight passed)</option><option value="in_portal" ${app.status==='in_portal'?'selected':''}>In portal</option><option value="submitted" ${app.status==='submitted'?'selected':''}>Submitted on official portal</option><option value="rejected" ${app.status==='rejected'?'selected':''}>Rejected / returned by portal</option><option value="closed" ${app.status==='closed'?'selected':''}>Closed</option></select></div><div class="form-field" style="margin-top:13px"><label for="statusReference">Portal acknowledgement / reference number</label><input class="form-control" id="statusReference" name="receiptRef" value="${esc(app.receiptRef || '')}" placeholder="Required when marking submitted"/></div><div class="form-field" style="margin-top:13px"><label for="statusNote">Operator note (do not include identity numbers)</label><textarea class="form-control" id="statusNote" name="note" style="height:74px;padding:10px;resize:vertical" placeholder="Optional short note">${esc(app.statusNote || '')}</textarea></div><label class="check-line" style="margin-top:14px"><input id="confirmSubmitted" name="confirmed" type="checkbox"/><span>I personally saw the official portal confirmation for this application. I understand this app cannot verify submission itself.</span></label></div><div class="modal-foot"><button class="button button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Save status</button></div></form>`);
}

function showDeleteCitizenModal(citizenId) {
  const citizen = citizenById(citizenId);
  if (!citizen) { showToast('That citizen record no longer exists.', 'error'); return; }
  const linkedCount = vaultData.applications.filter(app => app.citizenId === citizenId).length;
  openModal(`<div class="modal-head"><div><h2>Delete citizen record?</h2><p>Permanent removal from this encrypted workspace.</p></div><button class="modal-close" type="button" data-action="close-modal">×</button></div><form id="deleteCitizenForm" data-id="${esc(citizenId)}"><div class="modal-body"><div class="notice warning"><span class="notice-icon">!</span><span>This will delete <strong>${esc(citizen.fullName)}</strong> and ${linkedCount} linked application record(s) from the current vault. Existing audit events and exported backups are not erased by this action. This cannot be undone in the workspace.</span></div><div class="form-field" style="margin-top:16px"><label for="deleteConfirm">Type DELETE to confirm</label><input class="form-control" id="deleteConfirm" name="confirmation" required pattern="DELETE" autocomplete="off" spellcheck="false" placeholder="DELETE"/><div class="small-note" style="margin-top:7px">Before deleting, export any records you are legally required to retain.</div></div></div><div class="modal-foot"><button class="button button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button button-danger-quiet" type="submit">Delete record and linked cases</button></div></form>`);
}

async function deleteCitizenAndCases(form) {
  const citizenId = form.dataset.id;
  const confirmation = String(new FormData(form).get('confirmation') || '');
  if (confirmation !== 'DELETE') { showToast('Type DELETE exactly to confirm this permanent action.', 'error'); return; }
  const citizen = citizenById(citizenId);
  if (!citizen) { closeModal(); showToast('That citizen record no longer exists.', 'error'); return; }
  const linked = vaultData.applications.filter(app => app.citizenId === citizenId);
  const linkedIds = new Set(linked.map(app => app.id));
  vaultData.applications = vaultData.applications.filter(app => app.citizenId !== citizenId);
  vaultData.citizens = vaultData.citizens.filter(item => item.id !== citizenId);
  if (linkedIds.has(selectedApplicationId)) { selectedApplicationId = null; currentCaseFiles = []; }
  if (editingCitizenId === citizenId) { editingCitizenId = null; currentOCR = { file: null, text: '', candidates: [] }; }
  audit('citizen_record_deleted', `Permanently removed one citizen record and ${linked.length} linked application record(s) from this vault. Personal field values are not included. Prior audit events and exported backups may still reference this record.`, 'citizen', citizenId);
  await persist();
  closeModal();
  navigate('overview');
  showToast(`Citizen record and ${linked.length} linked application record(s) deleted from this vault.`);
}

function showCitizenDisplay() {
  const service = serviceById(window.activeFeeServiceId) || vaultData.services[0];
  if (!service) { showToast('Configure a real service and its fee before opening citizen disclosure.', 'error'); return; }
  const app = applicationById(window.activeFeeApplicationId);
  const citizen = app ? currentCaseCitizen(app) : null;
  const total = serviceFeeTotal(service);
  openModal(`<div class="modal-head"><div><h2>Citizen view</h2><p>Large-text fee disclosure for the citizen to review.</p></div><button class="modal-close" type="button" data-action="close-modal">×</button></div><div class="modal-body"><div class="big-citizen"><div class="citizen-mark">₹</div><h2>Here is the service fee</h2><p>${esc(service.name)}</p><div class="citizen-fee-row"><span>Government / portal fee</span><strong>${service.officialFee == null ? 'Not configured' : formatINR(service.officialFee)}</strong></div><div class="citizen-fee-row"><span>Operator service charge</span><strong>${service.operatorCharge == null ? 'Not configured' : formatINR(service.operatorCharge)}</strong></div><div class="citizen-fee-row total"><span>Total payable</span><strong>${total == null ? '—' : formatINR(total)}</strong></div><div class="citizen-warning">${isFeeVerified(service) ? 'Please confirm these amounts with the official source before payment. Ask for the appropriate transaction receipt after payment.' : 'The fee is not verified here. Do not pay based on an unconfigured or unverified amount. The operator must check the official portal fee and explain both charges.'}</div><div class="small-note" style="margin-top:17px">This is a fee disclosure, not a government receipt or proof of payment.</div></div><div class="inline-actions no-print" style="margin-top:15px;justify-content:center"><button class="button button-primary" data-action="speak-fees">🔊 Read aloud</button><button class="button button-secondary" data-action="print-receipt">Print disclosure</button></div></div>`, true);
}

function formatCurrencyForSpeech(amount, language) {
  if (amount == null) {
    if (language.startsWith('hi')) return 'राशि तय नहीं है';
    if (language.startsWith('mr')) return 'रक्कम निश्चित नाही';
    if (language.startsWith('bn')) return 'পরিমাণ নির্ধারিত নয়';
    if (language.startsWith('gu')) return 'રકમ નક્કી નથી';
    if (language.startsWith('ta')) return 'தொகை குறிப்பிடப்படவில்லை';
    if (language.startsWith('te')) return 'మొత్తం నిర్ణయించలేదు';
    return 'amount not configured';
  }
  const n = new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(Number(amount));
  if (language.startsWith('hi')) return `${n} रुपये`;
  if (language.startsWith('mr')) return `${n} रुपये`;
  if (language.startsWith('bn')) return `${n} রুপি`;
  if (language.startsWith('gu')) return `${n} રૂપિયા`;
  if (language.startsWith('ta')) return `${n} ரூபாய்`;
  if (language.startsWith('te')) return `${n} రూపాయలు`;
  return `${n} rupees`;
}
function speakFees() {
  if (!('speechSynthesis' in window)) { showToast('Audio is not supported in this browser. Show the text disclosure instead.', 'error'); return; }
  const service = serviceById(window.activeFeeServiceId) || vaultData.services[0];
  if (!service) { showToast('Configure a real service before reading fees aloud.', 'error'); return; }
  const lang = vaultData.profile.language || 'hi-IN';
  const official = formatCurrencyForSpeech(service.officialFee, lang);
  const operator = formatCurrencyForSpeech(service.operatorCharge, lang);
  const total = serviceFeeTotal(service);
  let line;
  if (lang.startsWith('hi')) {
    line = `इस सेवा का नाम ${service.name} है। सरकारी पोर्टल शुल्क: ${official}। केंद्र सेवा शुल्क: ${operator}। कुल राशि: ${total == null ? 'अभी तय नहीं है' : formatCurrencyForSpeech(total, lang)}। कृपया भुगतान से पहले आधिकारिक पोर्टल पर शुल्क की पुष्टि करें। यह सरकारी रसीद नहीं है।`;
  } else if (lang.startsWith('mr')) {
    line = `या सेवेचे नाव ${service.name} आहे. सरकारी पोर्टल शुल्क ${official}. केंद्र सेवा शुल्क ${operator}. एकूण रक्कम ${total == null ? 'निश्चित नाही' : formatCurrencyForSpeech(total, lang)}. कृपया पैसे देण्यापूर्वी अधिकृत पोर्टलवर शुल्क तपासा. ही सरकारी पावती नाही.`;
  } else if (lang.startsWith('bn')) {
    line = `এই পরিষেবার নাম ${service.name}। সরকারি পোর্টাল ফি ${official}। কেন্দ্রের পরিষেবা চার্জ ${operator}। মোট ${total == null ? 'এখনও নির্ধারিত নয়' : formatCurrencyForSpeech(total, lang)}। অর্থ দেওয়ার আগে সরকারি পোর্টালে ফি যাচাই করুন। এটি সরকারি রসিদ নয়।`;
  } else if (lang.startsWith('gu')) {
    line = `આ સેવાનું નામ ${service.name} છે. સરકારી પોર્ટલ ફી: ${official}. કેન્દ્ર સેવા ચાર્જ: ${operator}. કુલ રકમ: ${total == null ? 'હજુ નક્કી નથી' : formatCurrencyForSpeech(total, lang)}. ચુકવણી પહેલાં અધિકૃત પોર્ટલ પર ફીની પુષ્ટિ કરો. આ સરકારી રસીદ નથી.`;
  } else if (lang.startsWith('ta')) {
    line = `இந்த சேவையின் பெயர் ${service.name}. அரசு இணையதளக் கட்டணம்: ${official}. மைய சேவை கட்டணம்: ${operator}. மொத்தம்: ${total == null ? 'குறிப்பிடப்படவில்லை' : formatCurrencyForSpeech(total, lang)}. பணம் செலுத்துவதற்கு முன் அதிகாரப்பூர்வ இணையதளத்தில் கட்டணத்தை உறுதிப்படுத்துங்கள். இது அரசு ரசீது அல்ல.`;
  } else if (lang.startsWith('te')) {
    line = `ఈ సేవ పేరు ${service.name}. ప్రభుత్వ పోర్టల్ రుసుము: ${official}. కేంద్ర సేవా ఛార్జీ: ${operator}. మొత్తం: ${total == null ? 'నిర్ణయించలేదు' : formatCurrencyForSpeech(total, lang)}. చెల్లించే ముందు అధికారిక పోర్టల్‌లో రుసుమును నిర్ధారించండి. ఇది ప్రభుత్వ రసీదు కాదు.`;
  } else {
    line = `The service is ${service.name}. Official portal fee: ${official}. Centre service charge: ${operator}. Total payable: ${total == null ? 'not configured' : formatCurrencyForSpeech(total, lang)}. Please confirm the official fee before payment. This is not a government receipt.`;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(line);
  utterance.lang = lang;
  utterance.rate = 0.88;
  const voices = speechSynthesis.getVoices();
  const desired = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase()) || voices.find(v => v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
  if (desired) utterance.voice = desired;
  utterance.onerror = () => showToast('The selected system voice is unavailable. Use the on-screen text.', 'error');
  speechSynthesis.speak(utterance);
}

async function copyPayload(appId) {
  const app = applicationById(appId); const citizen = currentCaseCitizen(app); const service = serviceById(app?.serviceId);
  if (!app || !citizen || !service) { showToast('The application or linked citizen record is unavailable.', 'error'); return; }
  if (!app.preflight?.valid) { showToast('Run preflight and resolve blocking issues before copying the fill payload.', 'error'); return; }
  const payload = buildApplicationPayload(app, citizen, service);
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
    audit('payload_copied', 'Prepared a temporary browser-fill payload. Field data was not written to the audit description.', 'application', app.id);
    await persist();
    showToast('Payload copied. Paste into the browser companion, then clear the clipboard after use.');
  } catch (e) {
    openModal(`<div class="modal-head"><div><h2>Browser-fill payload</h2><p>Clipboard access was unavailable. Copy this JSON manually, then paste it into the companion extension.</p></div><button class="modal-close" type="button" data-action="close-modal">×</button></div><div class="modal-body"><textarea id="payloadFallback" class="form-control" style="height:260px;padding:10px;font:10px/1.5 ui-monospace,monospace">${esc(JSON.stringify(payload, null, 2))}</textarea><div class="notice warning" style="margin-top:12px"><span class="notice-icon">!</span><span>This contains personal data. Do not email, upload, or share it. Clear the clipboard after use.</span></div></div><div class="modal-foot"><button class="button button-secondary" data-action="close-modal">Close</button><button class="button button-primary" data-action="select-payload">Select payload</button></div></div>`);
  }
}

function renderCitizenRows(search = '') {
  const q = text(search).toLowerCase();
  const candidates = [...vaultData.citizens].filter(c => [c.fullName,c.mobile,c.district,c.id].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return candidates.length ? candidates.map(c=>`<tr><td><div style="display:flex;align-items:center"><span class="mini-avatar">${esc(initials(c.fullName).toUpperCase())}</span><div><div class="table-primary">${esc(c.fullName)}</div><div class="table-secondary">${esc(c.id)}</div></div></div></td><td>${esc(c.mobile || '—')}</td><td>${esc([c.district,c.state].filter(Boolean).join(', ') || '—')}</td><td>${c.aadhaar?`<span class="muted">${esc(maskIdentifier(c.aadhaar))}</span>`:'—'}</td><td>${dateShort(c.updatedAt)}</td><td><button class="button button-secondary button-xs" data-action="edit-citizen" data-id="${esc(c.id)}">Edit</button> <button class="button button-quiet button-xs" data-action="create-case-for-citizen" data-id="${esc(c.id)}">＋ Case</button> <button class="button button-danger-quiet button-xs" data-action="delete-citizen" data-id="${esc(c.id)}">Delete</button></td></tr>`).join('') : '';
}

function initEvents() {
  document.addEventListener('click', async event => {
    const pageBtn = event.target.closest('[data-page]');
    if (pageBtn) { event.preventDefault(); if (pageBtn.dataset.page === 'intake') editingCitizenId = null; navigate(pageBtn.dataset.page); return; }
    const navBtn = event.target.closest('.nav-item[data-page]');
    if (navBtn) { navigate(navBtn.dataset.page); return; }
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    if (action === 'backdrop-close' && event.target === actionBtn) { closeModal(); return; }
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'new-application') { showNewApplicationModal(); return; }
    if (action === 'new-service') { showServiceModal(); return; }
    if (action === 'edit-service' || action === 'edit-service-fees') { const service = serviceById(actionBtn.dataset.id); if (service) showServiceModal(service); return; }
    if (action === 'open-fee-settings') { const service = serviceById(window.activeFeeServiceId) || vaultData.services[0]; if (service) showServiceModal(service); else navigate('services'); return; }
    if (action === 'open-case') { selectedApplicationId = actionBtn.dataset.id; currentCaseFiles = []; navigate('applicationDetail'); return; }
    if (action === 'edit-citizen') { editingCitizenId = actionBtn.dataset.id; navigate('intake'); return; }
    if (action === 'delete-citizen') { showDeleteCitizenModal(actionBtn.dataset.id); return; }
    if (action === 'create-case-for-citizen') { showNewApplicationModal(); const select = $('#caseCitizen'); if (select) select.value = actionBtn.dataset.id; return; }
    if (action === 'preflight') { await runPreflight(actionBtn.dataset.id); return; }
    if (action === 'copy-payload') { await copyPayload(actionBtn.dataset.id); return; }
    if (action === 'change-status') { const app = applicationById(actionBtn.dataset.id); if (app) showStatusModal(app); return; }
    if (action === 'citizen-display') { showCitizenDisplay(); return; }
    if (action === 'speak-fees') { speakFees(); return; }
    if (action === 'print-receipt') { document.body.classList.add('printing-receipt'); window.print(); setTimeout(()=>document.body.classList.remove('printing-receipt'),600); return; }
    if (action === 'select-payload') { const el = $('#payloadFallback'); if (el) { el.focus(); el.select(); document.execCommand('copy'); showToast('Payload selected. Copy it before closing.'); } return; }
    if (action === 'export-audit') { exportAudit(); return; }
    if (action === 'export-backup') { exportBackup(); return; }
    if (action === 'lock') { await persist(); showLockedScreen(); return; }
    if (action === 'edit-service-fees') { const service = serviceById(actionBtn.dataset.id); if (service) showServiceModal(service); return; }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    const formId = form.getAttribute('id');
    if (formId === 'citizenForm') { event.preventDefault(); await saveCitizen(form); }
    else if (formId === 'deleteCitizenForm') { event.preventDefault(); await deleteCitizenAndCases(form); }
    else if (formId === 'caseCreateForm') { event.preventDefault(); await createApplication(form); }
    else if (formId === 'serviceForm') { event.preventDefault(); await saveService(form); }
    else if (formId === 'profileForm') { event.preventDefault(); await saveProfile(form); }
    else if (formId === 'interpretErrorForm') { event.preventDefault(); interpretError(); }
    else if (formId === 'statusForm') { event.preventDefault(); await saveStatus(form); }
  });

  document.addEventListener('change', async event => {
    if (event.target.id === 'ocrFile') {
      currentOCR = { file: event.target.files?.[0] || null, text: '', candidates: [] };
      $('#uploadMeta').textContent = currentOCR.file ? `${currentOCR.file.name} · ${(currentOCR.file.size/1024).toFixed(1)} KB` : 'No file selected';
      $('#runOcrButton').disabled = !currentOCR.file;
      $('#ocrState').textContent = 'Not run';
      $('#ocrText').value = '';
      $('#ocrCandidates').innerHTML = '';
      $('#applyOcrButton').disabled = true;
    } else if (event.target.id === 'caseDocumentsInput') {
      currentCaseFiles = [...(event.target.files || [])].map(f=>({ name:f.name, size:f.size, type:f.type }));
      if (currentPage === 'applicationDetail') renderPage();
    } else if (event.target.id === 'feeServiceSelect') {
      window.activeFeeServiceId = event.target.value;
      if (window.activeFeeApplicationId && applicationById(window.activeFeeApplicationId)?.serviceId !== window.activeFeeServiceId) window.activeFeeApplicationId = '';
      renderPage();
    } else if (event.target.id === 'feeApplicationSelect') {
      window.activeFeeApplicationId = event.target.value;
      const selected = applicationById(window.activeFeeApplicationId);
      if (selected && serviceById(selected.serviceId)) window.activeFeeServiceId = selected.serviceId;
      renderPage();
    } else if (event.target.id === 'appStatusFilter' || event.target.id === 'appSearch') {
      filterApplicationRows();
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'ocrText') {
      currentOCR.text = event.target.value;
      currentOCR.candidates = extractOcrCandidates(currentOCR.text);
      renderOcrCandidates();
    }
    if (event.target.id === 'appSearch') {
      clearTimeout(debounceSearchTimer); debounceSearchTimer = setTimeout(filterApplicationRows, 90);
    }
  });

  $('#lockButton').addEventListener('click', async () => { await persist(); showLockedScreen(); });
}

async function saveCitizen(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const consent = $('#citizenConsent').checked;
  const id = values.id || makeId('CIT');
  const citizen = {
    id, fullName: text(values.fullName), dob: values.dob || '', gender: values.gender || '', mobile: text(values.mobile), email: text(values.email),
    address: text(values.address), state: text(values.state), district: text(values.district), pincode: text(values.pincode),
    aadhaar: text(values.aadhaar), voterId: text(values.voterId), rationCard: text(values.rationCard), bankAccount: text(values.bankAccount), ifsc: text(values.ifsc).toUpperCase(),
    consentAt: consent ? (citizenById(id)?.consentAt || nowISO()) : '', consentPurpose: consent ? 'Record details for assisted-service intake; exact target service confirmed with the citizen when an application is created.' : '',
    createdAt: citizenById(id)?.createdAt || nowISO(), updatedAt: nowISO()
  };
  const result = validateCitizen(citizen, ['fullName']);
  if (!consent) { showToast('Record the citizen’s consent before saving.', 'error'); return; }
  if (!result.valid) { showFieldErrors(result.errors); return; }
  const index = vaultData.citizens.findIndex(c=>c.id===id);
  if (index >= 0) vaultData.citizens[index] = citizen;
  else vaultData.citizens.push(citizen);
  if (index >= 0) {
    for (const linkedApp of vaultData.applications.filter(a => a.citizenId === id && a.preflight)) {
      linkedApp.preflight = null;
      if (linkedApp.status === 'ready') linkedApp.status = 'draft';
      linkedApp.updatedAt = nowISO();
      audit('preflight_invalidated', 'A linked citizen record changed; its previous preflight result was invalidated.', 'application', linkedApp.id);
    }
  }
  audit(index >= 0 ? 'citizen_updated' : 'citizen_created', index >= 0 ? 'Updated a citizen record. Personal field values are not included in this event.' : 'Created a citizen record after consent confirmation. Personal field values are not included in this event.', 'citizen', id);
  await persist();
  editingCitizenId = null;
  currentOCR = { file:null, text:'', candidates:[] };
  syncProfileChrome();
  navigate('overview');
  showToast(index >= 0 ? 'Citizen record updated in the encrypted vault.' : 'Citizen record saved to the encrypted vault.');
}

function showFieldErrors(errors) {
  const first = errors[0];
  const input = first?.field ? $(`#${CSS.escape(first.field)}`) : null;
  if (input) { input.classList.add('error'); input.focus(); }
  showToast(errors.map(e=>e.message).slice(0,2).join(' '), 'error');
}

async function createApplication(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const citizen = citizenById(values.citizenId);
  const service = serviceById(values.serviceId);
  if (!citizen || !service) { showToast('Choose a valid citizen and service.', 'error'); return; }
  const app = { id: makeId('SD'), citizenId: citizen.id, serviceId: service.id, status: 'draft', createdAt: nowISO(), updatedAt: nowISO(), preflight: null, receiptRef: '', statusNote: '', portalErrorCategory: '' };
  vaultData.applications.unshift(app);
  audit('application_created', 'Created a local application record linked to a citizen and configured service.', 'application', app.id);
  await persist(); closeModal(); selectedApplicationId = app.id; currentCaseFiles = []; navigate('applicationDetail');
  showToast('Application record created. No portal submission has occurred.');
}

async function saveService(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const checked = $$('input[name="requiredFields"]:checked', form).map(x=>x.value);
  const allowedExtensions = text(values.allowedExtensions).split(',').map(v=>v.trim().toLowerCase().replace(/^\./,'')).filter(Boolean);
  const s = {
    id: editingServiceId || makeId('SRV'), name: text(values.name), department: text(values.department), portalUrl: text(values.portalUrl),
    officialFee: values.officialFee === '' ? null : Number(values.officialFee), operatorCharge: values.operatorCharge === '' ? null : Number(values.operatorCharge),
    feeSourceUrl: text(values.feeSourceUrl), feeVerifiedAt: text(values.feeVerifiedAt), maxUploadMB: values.maxUploadMB === '' ? null : Number(values.maxUploadMB),
    allowedExtensions: [...new Set(allowedExtensions)], requiredFields: checked, notes: text(values.notes), updatedAt: nowISO()
  };
  if (!s.name) { showToast('Enter a service name.', 'error'); return; }
  if (s.maxUploadMB != null && (!Number.isFinite(s.maxUploadMB) || s.maxUploadMB < 0.1 || s.maxUploadMB > 100)) { showToast('Maximum upload size must be between 0.1 and 100 MB, or left blank until confirmed.', 'error'); return; }
  if (s.allowedExtensions.some(ext => !/^[a-z0-9]{1,10}$/.test(ext))) { showToast('Use file extensions such as pdf or jpg, separated by commas.', 'error'); return; }
  if (s.portalUrl && !/^https:\/\//i.test(s.portalUrl)) { showToast('Use the official HTTPS portal URL where available. Verify the domain before saving.', 'error'); return; }
  if (s.feeSourceUrl && !/^https:\/\//i.test(s.feeSourceUrl)) { showToast('Use a secure HTTPS source URL for the fee source.', 'error'); return; }
  if (s.officialFee != null && (!Number.isFinite(s.officialFee) || s.officialFee < 0)) { showToast('Official fee must be a non-negative number or blank.', 'error'); return; }
  if (s.operatorCharge != null && (!Number.isFinite(s.operatorCharge) || s.operatorCharge < 0)) { showToast('Operator service charge must be a non-negative number or blank.', 'error'); return; }
  const index = vaultData.services.findIndex(x=>x.id===s.id);
  if (index >= 0) vaultData.services[index] = { ...vaultData.services[index], ...s };
  else vaultData.services.push(s);
  if (index >= 0) {
    for (const linkedApp of vaultData.applications.filter(a => a.serviceId === s.id && a.preflight)) {
      linkedApp.preflight = null;
      if (linkedApp.status === 'ready') linkedApp.status = 'draft';
      linkedApp.updatedAt = nowISO();
      audit('preflight_invalidated', 'Linked service rules changed; the previous preflight result was invalidated.', 'application', linkedApp.id);
    }
  }
  audit(index >= 0 ? 'service_rules_updated' : 'service_created', index >= 0 ? 'Updated service rules and fee configuration.' : 'Created an operator-configured service definition.', 'service', s.id);
  await persist(); editingServiceId = null; closeModal(); navigate('services'); showToast('Service rules saved. Verify them against the live official portal.');
}

async function saveProfile(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  if (!text(values.operatorName) || !text(values.centreName)) { showToast('Operator name and centre name are required.', 'error'); return; }
  vaultData.profile.operatorName = text(values.operatorName);
  vaultData.profile.centreName = text(values.centreName);
  vaultData.profile.language = values.language || 'hi-IN';
  vaultData.settings.autoLockMinutes = Number(values.autoLockMinutes) || 15;
  audit('profile_updated', 'Updated operator profile and workspace preferences.', 'workspace', 'local');
  await persist(); syncProfileChrome(); renderPage(); scheduleAutoLock(); showToast('Workspace profile saved.');
}

async function saveStatus(form) {
  const app = applicationById(form.dataset.id);
  if (!app) { closeModal(); return; }
  const values = Object.fromEntries(new FormData(form).entries());
  const status = values.status;
  if (status === 'submitted') {
    if (!$('#confirmSubmitted').checked) { showToast('Confirm that you personally saw the official portal confirmation.', 'error'); return; }
    if (!text(values.receiptRef)) { showToast('Enter the real portal acknowledgement/reference before marking submitted.', 'error'); return; }
  }
  if (status === 'ready' && !app.preflight?.valid) { showToast('Run and pass local preflight before setting Ready for review.', 'error'); return; }
  app.status = status;
  app.receiptRef = text(values.receiptRef);
  app.statusNote = text(values.note);
  app.updatedAt = nowISO();
  app.preflight = app.preflight || null;
  audit('application_status_changed', `Changed application status to ${status.replace('_',' ')}. ${status === 'submitted' ? 'Operator confirmed official portal acknowledgement.' : 'No automatic portal state verification was performed.'}`, 'application', app.id);
  await persist(); closeModal(); renderPage(); showToast('Status updated and recorded locally.');
}

async function runPreflight(appId) {
  const app = applicationById(appId); const citizen = currentCaseCitizen(app); const service = serviceById(app?.serviceId);
  if (!app || !citizen || !service) { showToast('Missing application context; check the linked records.', 'error'); return; }
  const result = validateCase(citizen, service, currentCaseFiles);
  app.preflight = { valid: result.valid, errors: result.errors, warnings: result.warnings, checkedAt: nowISO(), rulesSnapshot: { requiredFields: service.requiredFields || [], maxUploadMB: service.maxUploadMB, allowedExtensions: service.allowedExtensions || [] } };
  app.updatedAt = nowISO();
  if (!result.valid && !['submitted','rejected','closed'].includes(app.status)) app.status = 'needs_correction';
  else if (result.valid && ['draft','needs_correction'].includes(app.status)) app.status = 'ready';
  audit('preflight_validation_run', `Ran local preflight validation: ${result.errors.length} blocking issues and ${result.warnings.length} warning(s).`, 'application', app.id);
  await persist(); renderPage();
  showToast(result.valid ? 'Configured checks passed. Review all warnings and the official portal.' : `${result.errors.length} blocking issue(s) need correction.`, result.valid ? 'success' : 'error');
}

function interpretError() {
  const raw = text($('#portalErrorText')?.value);
  const result = interpretPortalError(raw);
  const node = $('#errorInterpretation');
  if (!node) return;
  node.innerHTML = `<div class="notice ${result.confidence==='none'?'warning':''}"><span class="notice-icon">${result.confidence==='none'?'!':'i'}</span><span><strong>${esc(result.title)}</strong><br/>${esc(result.explanation)}<br/><br/><strong>Suggested next step:</strong> ${esc(result.action)}<div class="small-note" style="margin-top:8px">Classification: ${esc(result.category)} · ${result.confidence==='heuristic'?'heuristic match, not a diagnosis':'no reliable rule matched'}</div></span></div>`;
  const app = applicationById(selectedApplicationId);
  if (app) {
    app.portalErrorCategory = result.category;
    audit('portal_error_interpreted', `Interpreted a pasted portal message as: ${result.category}. The raw message was not stored.`, 'application', app.id);
    persist();
  }
}

function filterApplicationRows() {
  const q = text($('#appSearch')?.value).toLowerCase();
  const status = $('#appStatusFilter')?.value || 'all';
  const rows = $('#applicationRows'); if (!rows) return;
  const apps = [...vaultData.applications].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).filter(app => {
    const citizen = citizenById(app.citizenId); const service = serviceById(app.serviceId);
    const qOk = !q || [app.id, citizen?.fullName, service?.name, citizen?.mobile].some(v=>String(v||'').toLowerCase().includes(q));
    return qOk && (status === 'all' || app.status === status);
  });
  rows.innerHTML = apps.length ? apps.map(app => { const citizen=citizenById(app.citizenId); const service=serviceById(app.serviceId); return `<tr><td><div class="table-primary">${esc(citizen?.fullName || 'Citizen record unavailable')}</div><div class="table-secondary">${esc(app.id)}</div></td><td><div class="table-primary">${esc(service?.name || 'Service unavailable')}</div><div class="table-secondary">${esc(service?.department || '')}</div></td><td>${displayStatus(app.status)}</td><td>${dateShort(app.createdAt)}</td><td>${app.preflight?.valid?'<span class="pill" style="color:#2f8554;background:#eaf6ed">Preflight passed</span>':'<span class="pill">Not validated</span>'}</td><td><button class="button button-secondary button-xs" data-action="open-case" data-id="${esc(app.id)}">Open →</button></td></tr>`; }).join('') : `<tr><td colspan="6" style="padding:25px;text-align:center;color:#8b9a90">No applications match this filter.</td></tr>`;
}

async function runOcr() {
  const file = currentOCR.file;
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Choose an image file. PDF OCR is not supported in this build.', 'error'); return; }
  if (file.size > 12 * 1024 * 1024) { showToast('Choose an image below 12 MB for reliable browser-side OCR.', 'error'); return; }
  const button = $('#runOcrButton'); const progress = $('#ocrProgress'); const state = $('#ocrState');
  button.disabled = true; button.textContent = 'Loading OCR…'; state.textContent = 'Loading engine';
  try {
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
        script.onload = resolve; script.onerror = () => reject(new Error('Could not load Tesseract.js. Check the internet connection, then retry or enter values manually.'));
        document.head.appendChild(script);
      });
    }
    const language = (vaultData.profile.language || 'hi-IN').startsWith('hi') ? 'hin+eng' : 'eng';
    const worker = await window.Tesseract.createWorker(language, 1, { logger: m => {
      if (m.status === 'recognizing text') { const percent = Math.round((m.progress || 0) * 100); progress.textContent = `${percent}%`; state.textContent = `Reading ${percent}%`; }
      else if (m.status) state.textContent = m.status;
    } });
    const result = await worker.recognize(file);
    await worker.terminate();
    currentOCR.text = result?.data?.text || '';
    currentOCR.candidates = extractOcrCandidates(currentOCR.text);
    $('#ocrText').value = currentOCR.text;
    renderOcrCandidates();
    state.textContent = 'Review results';
    progress.textContent = `${currentOCR.candidates.length} candidate(s)`;
    $('#applyOcrButton').disabled = currentOCR.candidates.length === 0;
    audit('document_ocr_run', 'Ran browser-side OCR on a selected image. The image and raw OCR text were not stored in the vault.', 'citizen', editingCitizenId || 'new');
    await persist();
    showToast('OCR finished. Check the original document before applying any candidate.');
  } catch (error) {
    console.error(error);
    state.textContent = 'Could not run';
    progress.textContent = '';
    showToast(error.message || 'OCR failed. Enter details manually.', 'error');
  } finally {
    button.disabled = !currentOCR.file;
    button.textContent = 'Run on-device OCR';
  }
}

function renderOcrCandidates() {
  const wrap = $('#ocrCandidates'); if (!wrap) return;
  const candidates = currentOCR.candidates || [];
  if (!candidates.length) { wrap.innerHTML = ''; $('#applyOcrButton').disabled = true; return; }
  wrap.innerHTML = `<div class="small-note" style="margin:4px 0 2px">Check only the candidate(s) the citizen confirms.</div>${candidates.map(c=>`<label class="candidate-row"><input type="checkbox" data-ocr-key="${esc(c.key)}"/><span><strong>${esc(c.label)}${c.sensitive?' · Sensitive':''}</strong><span>${esc(c.key==='aadhaar'?maskIdentifier(c.value):c.value)}</span>${c.sensitive?'<span class="field-help">Sensitive identifier detected. Confirm whether this service needs it.</span>':''}</span></label>`).join('')}`;
  $('#applyOcrButton').disabled = false;
}

function applyOcrCandidates() {
  const selected = $$('[data-ocr-key]:checked');
  if (!selected.length) { showToast('Check at least one OCR candidate first.', 'error'); return; }
  for (const box of selected) {
    const candidate = currentOCR.candidates.find(c=>c.key===box.dataset.ocrKey);
    const input = $(`#citizenForm [name="${CSS.escape(box.dataset.ocrKey)}"]`);
    if (candidate && input) input.value = candidate.value;
  }
  showToast(`${selected.length} candidate(s) copied into the form. Verify each value before saving.`);
}

function exportAudit() {
  const header = ['id','timestamp','action','description','entityType','entityId'];
  const csv = [header.join(','), ...(vaultData.audit || []).map(row=>header.map(key=>`"${String(row[key] ?? '').replace(/"/g,'""')}"`).join(','))].join('\r\n');
  downloadBlob(csv, 'text/csv;charset=utf-8', `sevadesk-audit-${new Date().toISOString().slice(0,10)}.csv`);
  showToast('Audit CSV exported. Store it securely.');
}
async function exportBackup() {
  if (!getEnvelope()) { showToast('No encrypted vault exists yet.', 'error'); return; }
  audit('encrypted_backup_exported', 'Exported an encrypted vault backup. The backup contains ciphertext, not a plaintext export.', 'workspace', 'local');
  await persist();
  const envelope = getEnvelope();
  downloadBlob(JSON.stringify({ product: 'SevaDesk', backupVersion: 1, exportedAt: nowISO(), encryptedVault: envelope }, null, 2), 'application/json', `sevadesk-encrypted-backup-${new Date().toISOString().slice(0,10)}.json`);
  showToast('Encrypted backup exported. The passphrase is still required to unlock it.');
}
function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function attachStandaloneButtons() {
  $('#runOcrButton').addEventListener('click', runOcr);
  $('#applyOcrButton').addEventListener('click', applyOcrCandidates);
  const restoreInput = $('#restoreInput');
  if (restoreInput) restoreInput.addEventListener('change', restoreBackupFile);
}

async function restoreBackupFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const envelope = parsed.encryptedVault || parsed;
    if (!envelope?.salt || !envelope?.iv || !envelope?.ciphertext || envelope.kdf !== 'PBKDF2-SHA256') throw new Error('This file does not look like a SevaDesk encrypted backup.');
    if (getEnvelope() && !confirm('Replace this browser’s current SevaDesk vault with the selected encrypted backup? Download a backup first if you need both.')) return;
    localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
    showToast('Encrypted backup restored. Unlock with the original passphrase.');
    showLockedScreen();
  } catch (error) { showToast(error.message || 'Could not restore the backup.', 'error'); }
  finally { event.target.value = ''; }
}

function scheduleAutoLock() {
  clearTimeout(autoLockTimer);
  if (!vaultKey || !vaultData) return;
  const minutes = Math.max(1, Number(vaultData.settings?.autoLockMinutes || 15));
  autoLockTimer = setTimeout(async () => {
    try { await persist(); } finally { showLockedScreen(); showToast('Workspace locked after inactivity.'); }
  }, minutes * 60 * 1000);
}

function resetAutoLock() {
  if (vaultKey && !$('#appShell').classList.contains('hidden')) scheduleAutoLock();
}

function initialize() {
  setLockMode(!getEnvelope());
  unlockWorkspace();
  initEvents();
  $('#restoreBackupButton').addEventListener('click', () => $('#restoreInput').click());
  $('#restoreInput').addEventListener('change', restoreBackupFile);
  for (const eventName of ['pointerdown','keydown','touchstart']) document.addEventListener(eventName, resetAutoLock, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resetAutoLock(); });
}

initialize();
