import { suggestFieldMatches, FIELD_LABELS, normalizeText } from './core.js';

const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state = { payload: null, fields: [], suggestions: [], mappings: [], lastScan: null };

function status(id, message, type = '') {
  const node = $(id); node.textContent = message; node.className = `status-note ${type}`.trim();
}
function currentTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0]);
}

function parsePayload() {
  const raw = $('#payloadInput').value.trim();
  if (!raw) { status('#payloadStatus', 'Paste the JSON payload first.', 'error'); return; }
  try {
    const parsed = JSON.parse(raw);
    const fields = parsed?.citizen?.fields;
    if (parsed?.schemaVersion !== 1 || !fields || typeof fields !== 'object') throw new Error('Expected a SevaDesk schemaVersion 1 payload with citizen.fields.');
    state.payload = parsed;
    $('#payloadInput').value = '';
    $('#payloadInput').placeholder = 'Payload loaded into temporary popup memory. Clear it at any time.';
    const count = Object.values(fields).filter(v => v != null && String(v).trim() !== '').length;
    status('#payloadStatus', `Loaded ${count} field value(s) for ${parsed.citizen.displayName || 'this citizen'} · ${parsed.application?.id || 'application'}. Values remain in popup memory only.`, 'success');
    $('#scanPage').disabled = false;
    $('#mappingSection').classList.add('hidden');
    state.fields = []; state.suggestions = []; state.mappings = [];
  } catch (error) { status('#payloadStatus', error.message || 'The payload is not valid JSON.', 'error'); }
}

function getSafeControls() {
  const all = [...document.querySelectorAll('input,textarea,select')];
  const visible = all.filter(el => {
    const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file') return false;
    if (['password','checkbox','radio','submit','button','reset','image'].includes((el.type || '').toLowerCase())) return false;
    const words = [el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.autocomplete].filter(Boolean).join(' ');
    if (/captcha|one.?time.?password|\botp\b|verification.?code|security.?code|password|passcode|transaction.?pin/i.test(words)) return false;
    return true;
  });
  return visible;
}

function scanCurrentForm() {
  // This function is injected into the active tab, so keep all helpers inside it.
  const controls = [...document.querySelectorAll('input,textarea,select')].filter(el => {
    const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file') return false;
    if (['password','checkbox','radio','submit','button','reset','image'].includes((el.type || '').toLowerCase())) return false;
    const words = [el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.autocomplete].filter(Boolean).join(' ');
    if (/captcha|one.?time.?password|\botp\b|verification.?code|security.?code|password|passcode|transaction.?pin/i.test(words)) return false;
    return true;
  });
  return controls.map((el,index) => {
    const labelTexts = [];
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) labelTexts.push(label.innerText || label.textContent || '');
    }
    if (el.labels) for (const label of el.labels) labelTexts.push(label.innerText || label.textContent || '');
    const wrapper = el.closest('label'); if (wrapper) labelTexts.push(wrapper.innerText || wrapper.textContent || '');
    let label = [...new Set(labelTexts.map(s=>s.trim()).filter(Boolean))].join(' ').replace(/\s+/g,' ').slice(0,180);
    if (!label) label = [el.getAttribute('aria-label'),el.placeholder,el.name,el.id].filter(Boolean).join(' ').slice(0,180);
    if (!label) label = (el.parentElement?.innerText || '').replace(/\s+/g,' ').trim().slice(0,100) || `Field ${index + 1}`;
    return {
      index, label,
      name: el.name || '', id: el.id || '', placeholder: el.placeholder || '', autocomplete: el.autocomplete || '',
      type: (el.type || el.tagName.toLowerCase()).toLowerCase(), required: !!el.required,
      maxLength: Number.isFinite(el.maxLength) ? el.maxLength : -1, minLength: Number.isFinite(el.minLength) ? el.minLength : -1,
      pattern: el.getAttribute('pattern') || '', min: el.getAttribute('min') || '', max: el.getAttribute('max') || '',
      options: el.tagName === 'SELECT' ? [...el.options].filter(o=>o.value !== '').slice(0,60).map(o=>({value:o.value,label:(o.textContent||'').trim().slice(0,120)})) : []
    };
  });
}

async function scanPortal() {
  const tab = await currentTab();
  if (!tab?.id) { status('#pageStatus', 'Could not find the active tab.', 'error'); return; }
  status('#pageStatus', 'Scanning visible fields…');
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanCurrentForm });
    const fields = result?.[0]?.result || [];
    state.fields = fields;
    state.lastScan = { tabId: tab.id, url: tab.url, title: tab.title, count: fields.length };
    if (!fields.length) {
      status('#pageStatus', 'No fillable visible fields were found. Check that the portal form is open and this is not a browser-internal page.', 'warning');
      state.suggestions = []; state.mappings = []; $('#mappingSection').classList.add('hidden'); return;
    }
    status('#pageStatus', `${fields.length} visible text/date/select fields found on ${tab.url || 'the active tab'}. Field values were not read.`, 'success');
    buildMappings();
  } catch (error) {
    status('#pageStatus', 'Could not inspect this tab. Open the actual portal page (not chrome://, the Web Store, or a restricted browser page) and try again.', 'error');
  }
}

function optionMatch(field, value) {
  if (field.type !== 'select-one' && field.type !== 'select-multiple') return true;
  const val = normalizeText(value);
  return field.options.some(option => normalizeText(option.value) === val || normalizeText(option.label) === val || normalizeText(option.label).includes(val) || val.includes(normalizeText(option.label)));
}

function buildMappings() {
  const dataFields = state.payload?.citizen?.fields || {};
  const suggestions = suggestFieldMatches(dataFields, state.fields);
  state.suggestions = suggestions;
  state.mappings = suggestions.map(s => ({ key:s.key, index:s.confidence >= 80 ? s.suggestedIndex : -1, value:s.value }));
  $('#mappingSection').classList.remove('hidden');
  const selectedCount = state.mappings.filter(m=>m.index >= 0).length;
  $('#mappingSummary').innerHTML = `<span class="summary-chip">${suggestions.length} available data field(s)</span><span class="summary-chip good">${selectedCount} suggested target(s)</span><span class="summary-chip warn">${state.fields.filter(f=>f.required).length} required page control(s)</span>`;
  $('#mappingRows').innerHTML = suggestions.length ? suggestions.map((s,i) => {
    const mapping = state.mappings[i];
    const conf = s.confidence >= 80 ? 'high' : s.confidence >= 55 ? 'medium' : '';
    const confidenceText = s.confidence >= 80 ? `Strong suggestion ${s.confidence}%` : s.confidence >= 55 ? `Check suggestion ${s.confidence}%` : 'Choose target manually';
    const selectOptions = [`<option value="-1">Do not fill this field</option>`, ...state.fields.map((f,j)=>`<option value="${f.index}" ${mapping.index===f.index?'selected':''}>${esc(f.label)}${f.required?' · required':''} · ${esc(f.type)}</option>`)].join('');
    const sensitive = ['aadhaar','bankAccount'].includes(s.key);
    const candidates = (s.candidates || []).slice(0,3).map(c=>`${c.field.label} (${c.score}%)`).join(' · ') || 'No confident match. Select manually.';
    return `<div class="mapping-row" data-map-row="${esc(s.key)}"><div class="mapping-top"><strong>${esc(s.label)}</strong><span class="confidence ${conf}">${confidenceText}</span></div><div class="mapping-controls"><div><label for="mapTarget-${i}">Target on portal</label><select id="mapTarget-${i}" data-target-key="${esc(s.key)}">${selectOptions}</select></div><div><label for="mapValue-${i}">Value to enter${sensitive?' · sensitive':''}</label><input id="mapValue-${i}" data-value-key="${esc(s.key)}" type="${sensitive?'password':'text'}" value="${esc(s.value)}" autocomplete="off"/></div></div><div class="mapping-hint">Potential matches: ${esc(candidates)}${s.key==='aadhaar'?' · Fill only when the service is permitted to require it.':''}</div><div class="mapping-hint" data-validation-key="${esc(s.key)}"></div></div>`;
  }).join('') : '<div class="empty-note">No data fields are available in this payload.</div>';
  $('#mappingWarnings').innerHTML = '';
  $('#fillResult').textContent = '';
  $('#fillFields').disabled = selectedCount === 0;
  updateMappingValidation();
}

function updateMappingValidation() {
  const warnings = [];
  for (const suggestion of state.suggestions) {
    const target = $(`[data-target-key="${CSS.escape(suggestion.key)}"]`);
    const valueInput = $(`[data-value-key="${CSS.escape(suggestion.key)}"]`);
    const hint = $(`[data-validation-key="${CSS.escape(suggestion.key)}"]`);
    if (!target || !valueInput || !hint) continue;
    const index = Number(target.value); const value = valueInput.value;
    const field = state.fields.find(f=>f.index === index);
    hint.textContent = '';
    hint.className = 'mapping-hint';
    if (index < 0) continue;
    if (!field) { warnings.push(`${suggestion.label}: selected portal field is no longer available. Rescan.`); continue; }
    const problems = [];
    if (field.maxLength > 0 && value.length > field.maxLength) problems.push(`Value is longer than the portal's ${field.maxLength}-character limit.`);
    if (field.minLength > 0 && value.length < field.minLength) problems.push(`Value is shorter than the portal's ${field.minLength}-character minimum.`);
    if (field.pattern) {
      try { if (!new RegExp(`^(?:${field.pattern})$`).test(value)) problems.push('Value does not match the visible field pattern.'); } catch { problems.push('Portal pattern could not be evaluated safely.'); }
    }
    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) problems.push('Date field expects YYYY-MM-DD; check the portal’s intended format.');
    if (!optionMatch(field, value)) problems.push('No dropdown option clearly matches this value. Choose an option manually on the portal if needed.');
    if (problems.length) { hint.textContent = problems.join(' '); hint.classList.add('bad'); warnings.push(`${suggestion.label}: ${problems.join(' ')}`); }
  }
  const selectedIndices = new Set(state.mappings.map(m=>m.index).filter(i=>i >= 0));
  const requiredMissing = state.fields.filter(f=>f.required && !selectedIndices.has(f.index));
  if (requiredMissing.length) warnings.unshift(`${requiredMissing.length} required portal field(s) are not mapped. Complete them manually before submission.`);
  $('#mappingWarnings').innerHTML = warnings.length ? warnings.slice(0,8).map(w=>`<div class="warning-item">${esc(w)}</div>`).join('') : '<div class="status-note success">No client-side mapping warnings detected. Still inspect every filled field against the source document.</div>';
  $('#fillFields').disabled = state.mappings.every(m=>m.index < 0);
}

async function fillMappedFields() {
  updateMappingValidation();
  const map = state.suggestions.map(s => {
    const target = $(`[data-target-key="${CSS.escape(s.key)}"]`);
    const value = $(`[data-value-key="${CSS.escape(s.key)}"]`);
    return { key:s.key, index:Number(target?.value ?? -1), value:value?.value ?? '' };
  }).filter(m=>m.index >= 0);
  if (!map.length) { status('#fillResult', 'Choose at least one target field.', 'error'); return; }
  const tab = await currentTab();
  if (!tab?.id) { status('#fillResult', 'Could not find active tab.', 'error'); return; }
  status('#fillResult', 'Filling reviewed fields…');
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillOnCurrentPage, args: [map] });
    const report = results?.[0]?.result || { filled:[], skipped:[] };
    const filled = report.filled || []; const skipped = report.skipped || [];
    status('#fillResult', `Filled ${filled.length} field(s). Skipped ${skipped.length}. Inspect the live page and correct every field before continuing.`, filled.length ? 'success' : 'warning');
    const details = [...filled.map(s=>`Filled: ${s}`), ...skipped.map(s=>`Skipped: ${s}`)];
    if (details.length) $('#fillResult').title = details.join('\n');
  } catch {
    status('#fillResult', 'Could not fill this page. It may have navigated, refreshed or be a restricted browser page. Rescan and review.', 'error');
  }
}

function fillOnCurrentPage(mappings) {
  const all = [...document.querySelectorAll('input,textarea,select')];
  const controls = all.filter(el => {
    const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file') return false;
    if (['password','checkbox','radio','submit','button','reset','image'].includes((el.type || '').toLowerCase())) return false;
    const words = [el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.autocomplete].filter(Boolean).join(' ');
    if (/captcha|one.?time.?password|\botp\b|verification.?code|security.?code|password|passcode|transaction.?pin/i.test(words)) return false;
    return true;
  });
  const norm = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const report = { filled:[], skipped:[] };
  for (const map of mappings) {
    const el = controls[map.index];
    if (!el) { report.skipped.push(`${map.key}: target disappeared; scan again`); continue; }
    if (['password','checkbox','radio','file','hidden'].includes((el.type || '').toLowerCase())) { report.skipped.push(`${map.key}: protected control type`); continue; }
    let value = String(map.value ?? '');
    if (el.tagName === 'SELECT') {
      const normalized = norm(value);
      const choice = [...el.options].find(o => o.value && (norm(o.value) === normalized || norm(o.textContent) === normalized || norm(o.textContent).includes(normalized) || normalized.includes(norm(o.textContent))));
      if (!choice) { report.skipped.push(`${map.key}: no matching dropdown option`); continue; }
      el.value = choice.value;
    } else {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles:true, composed:true }));
    el.dispatchEvent(new Event('change', { bubbles:true, composed:true }));
    report.filled.push(map.key);
  }
  return report;
}

function inspectVisibleErrors() {
  const selectors = ['[role="alert"]','[aria-live="assertive"]','[aria-live="polite"]','.error','.error-message','.invalid-feedback','.text-danger','.alert-danger','.field-error'];
  const nodes = [...new Set(selectors.flatMap(s=>[...document.querySelectorAll(s)]))];
  return nodes.filter(el => { const r=el.getBoundingClientRect(); const style=getComputedStyle(el); const v=(el.innerText||el.textContent||'').trim(); return r.width>0&&r.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&v.length>=3&&v.length<=700; })
    .map(el=>(el.innerText||el.textContent||'').trim().replace(/\s+/g,' ')).filter((v,i,a)=>a.indexOf(v)===i).slice(0,12);
}

function categorizeError(message) {
  const rules = [
    [/file.{0,25}(size|large|limit)|size.{0,25}(exceed|limit)|upload.{0,25}(limit|large)/i,'Document upload','Check the official maximum file size and accepted types.'],
    [/required|mandatory|cannot be blank|cannot be empty|please enter/i,'Required field','Review required fields, sections and dropdowns.'],
    [/date.{0,30}(format|invalid|valid)|invalid.{0,20}date|dd[\/-]mm[\/-]yyyy|yyyy[\/-]mm[\/-]dd/i,'Date format','Check the portal’s displayed date format and source document.'],
    [/aadhaar|aadhar|uidai|uid number/i,'Identity field','Verify digits and confirm the identifier is permitted and required for this service.'],
    [/mobile|phone number|contact number/i,'Contact field','Check format and follow the portal’s normal OTP process.'],
    [/invalid format|format is invalid|invalid input|not valid/i,'Field format','Inspect the affected field’s accepted format and examples.'],
    [/session.{0,15}(expired|timeout)|login again|log in again/i,'Session','Re-authenticate normally and review the form before continuing.'],
    [/server error|internal server|\b500\b|\b502\b|\b503\b|service unavailable|try again later/i,'Portal availability','Avoid repeated submissions; preserve the message and retry later or contact the official helpdesk.'],
    [/duplicate|already exists|already registered/i,'Possible duplicate','Use the official status lookup before starting another application.']
  ];
  const match = rules.find(([regex])=>regex.test(message));
  return match ? { category:match[1], action:match[2], confidence:'Heuristic match; not a diagnosis.' } : { category:'Unmapped message', action:'No reliable rule matched. Preserve exact wording and check official help/support.', confidence:'No reliable match.' };
}

async function readErrors() {
  const tab = await currentTab();
  if (!tab?.id) return;
  $('#portalErrors').innerHTML = '<div class="status-note"><span class="spinner"></span> Inspecting visible messages…</div>';
  try {
    const result = await chrome.scripting.executeScript({ target:{tabId:tab.id}, func:inspectVisibleErrors });
    const messages = result?.[0]?.result || [];
    if (!messages.length) { $('#portalErrors').innerHTML = '<div class="status-note warning">No supported visible error banners found. Some portals render errors in custom components. Review the page manually.</div>'; return; }
    $('#portalErrors').innerHTML = messages.map(message=>{const parsed=categorizeError(message);return `<div class="error-card"><strong>${esc(parsed.category)} · ${esc(parsed.confidence)}</strong><p>${esc(message)}</p><p><b>Next step:</b> ${esc(parsed.action)}</p></div>`;}).join('');
  } catch { $('#portalErrors').innerHTML = '<div class="status-note error">Could not inspect this tab. Open the actual portal page and try again.</div>'; }
}

$('#loadPayload').addEventListener('click', parsePayload);
$('#clearPayload').addEventListener('click', () => { state.payload=null;state.fields=[];state.suggestions=[];state.mappings=[];$('#payloadInput').value='';$('#payloadInput').placeholder='Paste the JSON payload copied from an application review…';$('#scanPage').disabled=true;$('#mappingSection').classList.add('hidden');$('#portalErrors').innerHTML='';status('#payloadStatus','Payload cleared from popup memory.'); });
$('#scanPage').addEventListener('click', scanPortal);
$('#rescanPage').addEventListener('click', scanPortal);
$('#scanErrors').addEventListener('click', readErrors);
$('#fillFields').addEventListener('click', fillMappedFields);
$('#mappingRows').addEventListener('change', event => { if (event.target.matches('[data-target-key]')) { const mapping=state.mappings.find(m=>m.key===event.target.dataset.targetKey); if(mapping) mapping.index=Number(event.target.value); } updateMappingValidation(); });
$('#mappingRows').addEventListener('input', event => { if (event.target.matches('[data-value-key]')) { const mapping=state.mappings.find(m=>m.key===event.target.dataset.valueKey); if(mapping) mapping.value=event.target.value; } updateMappingValidation(); });
