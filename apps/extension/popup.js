import { suggestFieldMatches, FIELD_LABELS, normalizeText, tokenizeText } from './lib/core.js';
import { findAdapterByUrl, transformValue } from './lib/adapters.js';

const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const state = {
  payload: null,
  activeAdapter: null,
  fields: [],
  suggestions: [],
  mappings: [],
  lastScan: null,
  isScanning: false,
  isFilling: false
};

function status(id, message, type = '') {
  const node = $(id);
  if (!node) return;
  node.textContent = message;
  node.className = `status-note ${type}`.trim();
}

function showResultBanner(message, type = 'success') {
  const banner = $('#fillResult');
  if (!banner) return;
  banner.textContent = message;
  banner.className = `status-banner ${type}`;
  banner.classList.remove('hidden');
}

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

// Injected into target portal tab to scan visible form controls
function scanCurrentForm(adapterRules = {}) {
  const controls = [...document.querySelectorAll('input,textarea,select')].filter(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file') return false;
    if (['password', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image'].includes((el.type || '').toLowerCase())) return false;
    const words = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.autocomplete].filter(Boolean).join(' ');
    if (/captcha|one.?time.?password|\botp\b|verification.?code|security.?code|\bpassword\b|passcode|transaction.?pin/i.test(words)) return false;
    return true;
  });

  return controls.map((el, index) => {
    const labelTexts = [];

    // 1. Explicit <label for="id">
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) labelTexts.push(label.innerText || label.textContent || '');
      } catch (e) {}
    }

    // 2. el.labels (HTML5 standard)
    if (el.labels) {
      for (const label of el.labels) labelTexts.push(label.innerText || label.textContent || '');
    }

    // 3. Wrapping <label>
    const wrapper = el.closest('label');
    if (wrapper) labelTexts.push(wrapper.innerText || wrapper.textContent || '');

    // 4. Preceding table cell in government portal tables (ASP.NET / NIC / PHP layouts)
    try {
      const td = el.closest('td');
      if (td) {
        const prevTd = td.previousElementSibling;
        if (prevTd) labelTexts.push(prevTd.innerText || prevTd.textContent || '');
      }
      const tr = el.closest('tr');
      if (tr) {
        const th = tr.querySelector('th');
        if (th) labelTexts.push(th.innerText || th.textContent || '');
      }
    } catch (e) {}

    // 5. Surrounding .form-group / .form-row / fieldset container
    try {
      const group = el.closest('.form-group, .form-row, .row, .col, .field, fieldset, [class*="form-"]');
      if (group) {
        const glabel = group.querySelector('label, dt, th, .control-label, .form-label, span.label, legend');
        if (glabel) labelTexts.push(glabel.innerText || glabel.textContent || '');
      }
    } catch (e) {}

    // 6. Aria-label, placeholder, title, name, id
    if (el.getAttribute('aria-label')) labelTexts.push(el.getAttribute('aria-label'));
    if (el.placeholder) labelTexts.push(el.placeholder);
    if (el.title) labelTexts.push(el.title);
    if (el.name) labelTexts.push(el.name);
    if (el.id) labelTexts.push(el.id);

    let label = [...new Set(labelTexts.map(s => s.trim()).filter(Boolean))]
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 200);

    if (!label) {
      label = (el.parentElement?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100) || `Field ${index + 1}`;
    }

    // Declarative adapter rules check
    const matchedAdapterKeys = [];
    if (adapterRules) {
      for (const [key, rule] of Object.entries(adapterRules)) {
        if (!rule) continue;
        let isMatch = false;
        if (rule.targetSelector) {
          try {
            if (el.matches(rule.targetSelector)) isMatch = true;
          } catch (e) {}
        }
        if (!isMatch && Array.isArray(rule.fallbackSelectors)) {
          for (const fb of rule.fallbackSelectors) {
            try {
              if (el.matches(fb)) { isMatch = true; break; }
            } catch (e) {}
          }
        }
        if (isMatch) matchedAdapterKeys.push(key);
      }
    }

    return {
      index,
      id: el.id || '',
      name: el.name || '',
      matchedAdapterKeys,
      label,
      placeholder: el.placeholder || '',
      autocomplete: el.autocomplete || '',
      type: (el.type || el.tagName.toLowerCase()).toLowerCase(),
      required: !!el.required,
      options: el.tagName === 'SELECT'
        ? [...el.options].filter(o => o.value !== '').slice(0, 60).map(o => ({ value: o.value, label: (o.textContent || '').trim().slice(0, 120) }))
        : []
    };
  });
}

// Injected into portal page: burst-fills reviewed values and triggers framework event dispatchers
function fillOnCurrentPage(mappings, adapterRules) {
  const controls = [...document.querySelectorAll('input,textarea,select')].filter(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file') return false;
    if (['password', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image'].includes((el.type || '').toLowerCase())) return false;
    const words = [el.name, el.id, el.placeholder, el.getAttribute('aria-label')].filter(Boolean).join(' ');
    if (/captcha|otp|password|pin/i.test(words)) return false;
    return true;
  });

  const report = { filled: [], skipped: [] };

  for (const map of mappings) {
    let el = null;
    if (map.id) {
      try { el = document.getElementById(map.id); } catch (e) {}
    }
    if (!el && map.name) {
      try { el = document.querySelector(`[name="${CSS.escape(map.name)}"]`); } catch (e) {}
    }
    if (!el && typeof map.index === 'number' && map.index >= 0) {
      el = controls[map.index];
    }

    if (!el) {
      report.skipped.push(`${map.key}: element not found`);
      continue;
    }

    let val = String(map.value ?? '');
    const transform = adapterRules?.[map.key]?.transform;
    if (transform === 'digits_only') val = val.replace(/\D/g, '');
    else if (transform === 'uppercase') val = val.toUpperCase();
    else if (transform === 'date_dmy') {
      const ymd = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymd) val = `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
    }

    if (el.type === 'date') {
      // Standard HTML5 date inputs require YYYY-MM-DD
      const dmy = val.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
      if (dmy) val = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    if (el.tagName === 'SELECT') {
      const vLower = val.toLowerCase().trim();
      let opt = [...el.options].find(o => o.value.toLowerCase().trim() === vLower || (o.textContent || '').toLowerCase().trim() === vLower);
      if (!opt) {
        opt = [...el.options].find(o => (o.textContent || '').toLowerCase().includes(vLower) || (o.value || '').toLowerCase().includes(vLower));
      }
      if (!opt && (vLower === 'male' || vLower === 'm')) {
        opt = [...el.options].find(o => /^(male|m|पुरुष)$/i.test(o.textContent.trim()) || /^(m|male)$/i.test(o.value.trim()));
      }
      if (!opt && (vLower === 'female' || vLower === 'f')) {
        opt = [...el.options].find(o => /^(female|f|महिला)$/i.test(o.textContent.trim()) || /^(f|female)$/i.test(o.value.trim()));
      }
      if (opt) {
        el.value = opt.value;
      }
    } else {
      // Framework-safe setter invocation for React/Angular/Vue controlled inputs
      try {
        const proto = el instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const setMethod = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setMethod) {
          setMethod.call(el, val);
        } else {
          el.value = val;
        }
      } catch (e) {
        el.value = val;
      }
    }

    // Dispatch synthetic DOM events for ASP.NET / Angular / React / Vue
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    report.filled.push(map.key);
  }

  return report;
}

// Injected into portal page: extracts visible error alerts
function extractPageErrors() {
  const errorElements = [...document.querySelectorAll(
    '.error, .alert, .text-danger, .has-error, [role="alert"], #lblError, #errorMessage, .validation-summary-errors, .field-validation-error, span[id*="Error"], div[class*="error"], div[class*="alert"]'
  )].filter(el => {
    const style = getComputedStyle(el);
    return el.innerText && el.innerText.trim().length > 3 && style.display !== 'none' && style.visibility !== 'hidden';
  });
  return errorElements.map(el => el.innerText.trim()).slice(0, 3);
}

function updateHeroPanel() {
  const applicantNode = $('#applicantName');
  const serviceBadge = $('#serviceBadge');
  const portalBadge = $('#portalBadge');
  const caseSubtext = $('#caseSubtext');
  const heroBtn = $('#heroAutofillBtn');
  const heroBtnTitle = $('#heroBtnTitle');
  const heroBtnSub = $('#heroBtnSub');
  const countBadge = $('#mappingCountBadge');

  if (state.payload) {
    const applicant = state.payload.citizen?.displayName || state.payload.citizen?.fullName || 'Applicant';
    const serviceName = state.payload.application?.serviceName || 'Citizen Service';
    const caseId = state.payload.application?.id || '';

    applicantNode.textContent = applicant;
    serviceBadge.textContent = serviceName;
    caseSubtext.textContent = `Case: ${caseId || 'Active'} · ${Object.keys(state.payload.citizen?.fields || {}).length} verified fields available`;
  } else {
    applicantNode.textContent = 'Waiting for Case Data';
    serviceBadge.textContent = 'No Case';
    caseSubtext.textContent = 'Connects automatically via local loopback bridge from SevaDesk Workspace.';
  }

  if (state.activeAdapter) {
    portalBadge.textContent = `${state.activeAdapter.name}`;
    portalBadge.title = `State: ${state.activeAdapter.state || 'All'} · v${state.activeAdapter.version}`;
  }

  // Count ready fields
  const readyCount = state.mappings.filter(m => m.checked && m.index >= 0).length;
  countBadge.textContent = `${readyCount} Ready`;
  countBadge.className = `count-pill ${readyCount > 0 ? 'good' : ''}`;

  if (readyCount > 0) {
    heroBtn.disabled = false;
    heroBtnTitle.textContent = '⚡ AUTOFILL FORM NOW';
    heroBtnSub.textContent = `${readyCount} fields auto-matched & ready (<150ms fast burst)`;
  } else if (state.payload) {
    heroBtn.disabled = false;
    heroBtnTitle.textContent = '⚡ SCAN & AUTOFILL';
    heroBtnSub.textContent = 'Click to scan portal and burst-inject fields';
  } else {
    heroBtn.disabled = true;
    heroBtnTitle.textContent = 'WAITING FOR CASE';
    heroBtnSub.textContent = 'Send payload from SevaDesk or paste JSON below';
  }
}

async function scanPortalAndBuildMappings() {
  if (state.isScanning) return;
  state.isScanning = true;
  status('#pageStatus', 'Scanning portal form fields…');

  const tab = await currentTab();
  if (!tab?.id) {
    status('#pageStatus', 'Could not access active browser tab.', 'error');
    state.isScanning = false;
    return;
  }

  // Detect Declarative Adapter
  const adapter = findAdapterByUrl(tab.url || '');
  state.activeAdapter = adapter;

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanCurrentForm,
      args: [adapter?.fields || {}]
    });
    const fields = result?.[0]?.result || [];
    state.fields = fields;
    state.lastScan = { tabId: tab.id, url: tab.url, count: fields.length };

    if (!fields.length) {
      status('#pageStatus', 'No fillable controls found on this page. Confirm the form is open.', 'warning');
      $('#mappingRows').innerHTML = '<div class="empty-note">No input fields detected. Make sure the portal form is fully loaded.</div>';
      updateHeroPanel();
      state.isScanning = false;
      return;
    }

    status('#pageStatus', `Detected ${fields.length} portal controls. Running auto-matcher…`, 'success');
    buildMappings();
  } catch (error) {
    status('#pageStatus', 'Could not scan tab. Ensure target page is an HTTP/HTTPS portal.', 'error');
  } finally {
    state.isScanning = false;
  }
}

function buildMappings() {
  const dataFields = state.payload?.citizen?.fields || {};
  const suggestions = suggestFieldMatches(dataFields, state.fields);
  state.suggestions = suggestions;

  // Greedy 1-to-1 match assignment with priority to Declarative Adapters
  const assignedDomIndices = new Set();
  const preliminaryMappings = [];

  // Priority 1: Declarative adapter exact matches
  for (const s of suggestions) {
    let bestIndex = -1;
    let confidence = 0;

    const adapterMatch = state.fields.find(f => (f.matchedAdapterKeys || []).includes(s.key));
    if (adapterMatch && !assignedDomIndices.has(adapterMatch.index)) {
      bestIndex = adapterMatch.index;
      confidence = 100;
      assignedDomIndices.add(bestIndex);
    }

    preliminaryMappings.push({
      key: s.key,
      label: s.label,
      value: s.value,
      index: bestIndex,
      confidence: confidence,
      checked: false
    });
  }

  // Priority 2: Best heuristic scoring candidates (greedy 1-to-1)
  const unassigned = suggestions
    .map((s, idx) => ({ s, preliminary: preliminaryMappings[idx] }))
    .filter(item => item.preliminary.index === -1)
    .sort((a, b) => (b.s.confidence || 0) - (a.s.confidence || 0));

  for (const { s, preliminary } of unassigned) {
    const candidate = s.candidates.find(c => !assignedDomIndices.has(c.index));
    if (candidate && candidate.score >= 35) {
      preliminary.index = candidate.index;
      preliminary.confidence = candidate.score;
      assignedDomIndices.add(candidate.index);
    }
  }

  // Default: Pre-select ALL valid matches so operator has zero manual work!
  for (const m of preliminaryMappings) {
    m.checked = m.index >= 0;
  }

  state.mappings = preliminaryMappings;
  renderMappings();
  updateHeroPanel();
}

function renderMappings() {
  const container = $('#mappingRows');
  if (!container) return;

  if (!state.mappings.length) {
    container.innerHTML = '<div class="empty-note">No applicant fields available to map.</div>';
    return;
  }

  const html = state.mappings.map((m, i) => {
    const isSensitive = ['aadhaar', 'bankAccount'].includes(m.key);
    const displayVal = isSensitive
      ? (m.value.length > 4 ? `••••••••${m.value.slice(-4)}` : '••••')
      : m.value;

    const confClass = m.confidence >= 80 ? 'high' : m.confidence >= 40 ? 'med' : 'none';
    const confLabel = m.confidence >= 80
      ? `Exact (${m.confidence}%)`
      : m.confidence >= 40
        ? `Matched (${m.confidence}%)`
        : 'Unmatched';

    const selectOptions = [
      `<option value="-1" ${m.index === -1 ? 'selected' : ''}>-- Do not fill this field --</option>`,
      ...state.fields.map(f => {
        const isSelected = m.index === f.index;
        return `<option value="${f.index}" ${isSelected ? 'selected' : ''}>${esc(f.label)}${f.required ? ' *' : ''} (${esc(f.type)})</option>`;
      })
    ].join('');

    return `
      <div class="mapping-row ${m.checked ? 'checked' : ''} ${m.index === -1 ? 'unmatched' : ''}" data-key="${esc(m.key)}">
        <div class="mapping-top">
          <div class="mapping-label-group">
            <input type="checkbox" class="mapping-checkbox" id="chk-${i}" data-index="${i}" ${m.checked ? 'checked' : ''} />
            <label for="chk-${i}" class="field-name" title="${esc(m.label)}">${esc(m.label)}</label>
            <span class="field-val-preview" title="${esc(m.value)}">${esc(displayVal)}</span>
          </div>
          <span class="confidence-tag ${confClass}">${confLabel}</span>
        </div>
        <div class="mapping-controls">
          <select class="target-select" data-index="${i}">
            ${selectOptions}
          </select>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  // Add event listeners for checkboxes and select dropdowns
  container.querySelectorAll('.mapping-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = Number(e.target.dataset.index);
      if (state.mappings[idx]) {
        state.mappings[idx].checked = e.target.checked;
        const row = e.target.closest('.mapping-row');
        if (row) row.classList.toggle('checked', e.target.checked);
        updateHeroPanel();
      }
    });
  });

  container.querySelectorAll('.target-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const idx = Number(e.target.dataset.index);
      const chosenDomIndex = Number(e.target.value);
      if (state.mappings[idx]) {
        state.mappings[idx].index = chosenDomIndex;
        state.mappings[idx].checked = chosenDomIndex >= 0;
        state.mappings[idx].confidence = chosenDomIndex >= 0 ? 100 : 0;
        renderMappings();
        updateHeroPanel();
      }
    });
  });

  const readyCount = state.mappings.filter(m => m.checked && m.index >= 0).length;
  status('#pageStatus', `${readyCount} of ${state.mappings.length} applicant fields auto-matched and selected.`, 'success');
}

async function fillMappedFields() {
  if (state.isFilling) return;

  // If no fields scanned yet, scan first and then fill
  if (state.fields.length === 0) {
    await scanPortalAndBuildMappings();
  }

  const targetsToFill = state.mappings
    .filter(m => m.checked && m.index >= 0)
    .map(m => {
      const targetField = state.fields[m.index];
      return {
        key: m.key,
        index: m.index,
        id: targetField?.id || '',
        name: targetField?.name || '',
        value: m.value
      };
    });

  if (!targetsToFill.length) {
    showResultBanner('No fields are currently selected to fill. Enable at least one field checkbox.', 'warning');
    return;
  }

  const tab = await currentTab();
  if (!tab?.id) {
    showResultBanner('Could not locate active browser tab.', 'error');
    return;
  }

  state.isFilling = true;
  const heroBtnTitle = $('#heroBtnTitle');
  const heroBtnSub = $('#heroBtnSub');
  heroBtnTitle.textContent = '⚡ INJECTING FIELDS…';
  heroBtnSub.textContent = 'Burst-populating DOM elements in parallel…';

  const t0 = performance.now();
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillOnCurrentPage,
      args: [targetsToFill, state.activeAdapter?.fields || {}]
    });

    const elapsed = Math.round(performance.now() - t0);
    const report = results?.[0]?.result || { filled: [], skipped: [] };

    // Save to quick restore session cache (30 min TTL)
    try {
      if (chrome.storage?.local && state.payload) {
        chrome.storage.local.set({
          lastInjectedSession: {
            applicant: state.payload.citizen?.displayName || state.payload.citizen?.fullName || 'Applicant',
            service: state.payload.application?.serviceName || 'Service',
            payload: state.payload,
            timestamp: Date.now(),
            count: report.filled.length
          }
        });
      }
    } catch (e) {}

    showResultBanner(`⚡ Fast Burst: Injected ${report.filled.length} fields in ${elapsed}ms! Review before manual submit.`, 'success');
    heroBtnTitle.textContent = '⚡ RE-FILL FORM';
    heroBtnSub.textContent = `Successfully filled ${report.filled.length} fields in ${elapsed}ms`;
  } catch (err) {
    showResultBanner('Could not fill portal page. Ensure tab is an active government portal.', 'error');
    updateHeroPanel();
  } finally {
    state.isFilling = false;
  }
}

async function inspectPortalErrors() {
  const tab = await currentTab();
  if (!tab?.id) return;

  const section = $('#portalErrorsSection');
  const container = $('#portalErrors');
  if (section) section.classList.remove('hidden');

  container.innerHTML = '<div class="empty-note"><div class="spinner"></div><p>Scanning portal page for active error banners…</p></div>';

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageErrors
    });
    const foundErrors = results?.[0]?.result || [];

    if (!foundErrors.length) {
      container.innerHTML = '<div class="status-banner success">✓ No visible error alerts detected on this portal page.</div>';
      return;
    }

    let html = '';
    for (const msg of foundErrors) {
      let analysis = null;
      try {
        const res = await fetch('http://127.0.0.1:8765/api/error-interpreter/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        if (res.ok) analysis = await res.json();
      } catch (e) {}

      html += `
        <div class="error-item">
          <div class="error-title">Detected Banner: "${esc(msg)}"</div>
          ${analysis ? `
            <div class="error-remediation">
              <strong>${esc(analysis.title || analysis.category)}:</strong> ${esc(analysis.explanation)}
              <div class="error-action">Action: ${esc(analysis.action)}</div>
            </div>
          ` : `<div class="error-remediation">Rule: Check field constraints and re-verify against source document.</div>`}
        </div>
      `;
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div class="status-banner error">Could not inspect portal for errors.</div>';
  }
}

function parseManualPayload() {
  const raw = $('#payloadInput').value.trim();
  if (!raw) {
    status('#payloadStatus', 'Paste the JSON payload or dispatch via workspace.', 'error');
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const fields = parsed?.citizen?.fields;
    if (parsed?.schemaVersion !== 1 || !fields || typeof fields !== 'object') {
      throw new Error('Expected a SevaDesk schemaVersion 1 payload with citizen.fields.');
    }
    state.payload = parsed;
    $('#payloadInput').value = '';
    const count = Object.values(fields).filter(v => v != null && String(v).trim() !== '').length;
    status('#payloadStatus', `Loaded ${count} field(s) for ${parsed.citizen.displayName || 'applicant'}.`, 'success');
    updateHeroPanel();
    scanPortalAndBuildMappings();
  } catch (error) {
    status('#payloadStatus', error.message || 'Payload is not valid JSON.', 'error');
  }
}

// Event Listeners & Direct Local IPC Bridge
document.addEventListener('DOMContentLoaded', async () => {
  // Main Hero Autofill Button
  $('#heroAutofillBtn')?.addEventListener('click', fillMappedFields);

  // Toolbar Actions
  $('#selectAllBtn')?.addEventListener('click', () => {
    for (const m of state.mappings) {
      if (m.index >= 0) m.checked = true;
    }
    renderMappings();
    updateHeroPanel();
  });

  $('#deselectAllBtn')?.addEventListener('click', () => {
    for (const m of state.mappings) {
      m.checked = false;
    }
    renderMappings();
    updateHeroPanel();
  });

  $('#rescanBtn')?.addEventListener('click', scanPortalAndBuildMappings);
  $('#inspectErrorsBtn')?.addEventListener('click', inspectPortalErrors);

  // Manual Payload Drawer
  $('#loadPayload')?.addEventListener('click', parseManualPayload);
  $('#clearPayload')?.addEventListener('click', () => {
    $('#payloadInput').value = '';
    state.payload = null;
    status('#payloadStatus', 'Payload cleared from memory.');
    updateHeroPanel();
    renderMappings();
  });

  // Check for cached previous session (Timeout Recovery)
  try {
    if (chrome.storage?.local) {
      chrome.storage.local.get(['lastInjectedSession'], data => {
        const last = data?.lastInjectedSession;
        if (last && last.payload && Date.now() - last.timestamp < 30 * 60 * 1000) {
          const reinjectBtn = $('#reinjectPayload');
          if (reinjectBtn) {
            reinjectBtn.classList.remove('hidden');
            reinjectBtn.textContent = `⚡ Restore Last Session (${last.applicant || 'Applicant'})`;
            reinjectBtn.addEventListener('click', () => {
              state.payload = last.payload;
              updateHeroPanel();
              scanPortalAndBuildMappings().then(() => fillMappedFields());
            });
          }
        }
      });
    }
  } catch (e) {}

  // 1. Primary Direct Loopback IPC Bridge (Zero OS Clipboard PII Exposure)
  const bridgePill = $('#bridgeIndicator');
  const bridgeText = $('#bridgeText');

  try {
    const res = await fetch('http://127.0.0.1:8765/api/bridge/active-session', { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      const data = await res.json();
      if (data.active && data.session?.payload) {
        state.payload = data.session.payload;
        bridgePill.className = 'bridge-status-pill active';
        bridgeText.textContent = 'Bridge Active';
        updateHeroPanel();
        scanPortalAndBuildMappings();
        return;
      }
    }
  } catch (err) {
    // Daemon offline or no active session, continue to secondary fallback
  }

  // 2. Secondary Clipboard Fallback (if operator copied manually)
  try {
    const clip = await navigator.clipboard.readText();
    if (clip && clip.includes('"schemaVersion"') && clip.includes('"citizen"')) {
      const parsed = JSON.parse(clip);
      if (parsed?.schemaVersion === 1 && parsed?.citizen?.fields) {
        state.payload = parsed;
        bridgePill.className = 'bridge-status-pill clipboard';
        bridgeText.textContent = 'Clipboard Mode';
        updateHeroPanel();
        scanPortalAndBuildMappings();
        return;
      }
    }
  } catch {
    // Clipboard not accessible
  }

  // 3. Fallback: No case loaded yet, still scan current page so fields are ready
  bridgePill.className = 'bridge-status-pill';
  bridgeText.textContent = 'No Active Case';
  updateHeroPanel();
  scanPortalAndBuildMappings();
});
