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

function setStatus(message, type = '') {
  const resultNode = $('#fillResult');
  if (!resultNode) return;
  resultNode.textContent = message;
  resultNode.className = `feedback-text ${type}`.trim();
}

async function currentTab() {
  try {
    if (chrome?.tabs?.query) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    }
  } catch (e) {}
  return null;
}

// Injected into target portal tab to scan visible form controls
function scanCurrentForm(adapterRules = {}) {
  const controls = [...document.querySelectorAll('input,textarea,select')].filter(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file') return false;
    if (['checkbox', 'radio', 'submit', 'button', 'reset', 'image'].includes((el.type || '').toLowerCase())) return false;

    const words = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.autocomplete].filter(Boolean).join(' ');

    // Never touch CAPTCHAs, OTPs, or verification codes
    if (/captcha|one.?time.?password|\botp\b|verification.?code|security.?code/i.test(words)) return false;

    // Check if element is an Aadhaar or Bank account input (which government portals often mask as type="password")
    const isIdentityOrBank = /aadhaar|aadhar|adhar|\buid\b|uidai|account|bank|खाता/i.test(words);

    // If it's type="password" and NOT an identity/bank field, check surrounding text/labels
    if (el.type === 'password' && !isIdentityOrBank) {
      const surroundingText = (
        (el.parentElement?.innerText || '') + ' ' +
        (el.parentElement?.previousElementSibling?.innerText || '') + ' ' +
        (el.previousElementSibling?.innerText || '') + ' ' +
        (el.closest('tr, .form-group, .row, .col, [class*="col-"], [class*="form-"]')?.innerText || '')
      ).toLowerCase();

      const surroundingMatchesIdentity = /aadhaar|aadhar|adhar|\buid\b|uidai|account|bank|खाता/.test(surroundingText);
      if (!surroundingMatchesIdentity) {
        return false; // Skip actual user login passwords!
      }
    }

    // Exclude actual login passwords if not an Aadhaar or Bank field
    if (!isIdentityOrBank && /\bpassword\b|passcode|transaction.?pin/i.test(words)) {
      const surroundingText = (
        (el.parentElement?.innerText || '') + ' ' +
        (el.parentElement?.previousElementSibling?.innerText || '') + ' ' +
        (el.previousElementSibling?.innerText || '') + ' ' +
        (el.closest('tr, .form-group, .row, .col, [class*="col-"], [class*="form-"]')?.innerText || '')
      ).toLowerCase();
      if (!/aadhaar|aadhar|adhar|\buid\b|uidai|account|bank|खाता/.test(surroundingText)) {
        return false;
      }
    }

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

    // 5. Direct previous sibling or parent's previous sibling (e.g. Bootstrap input-group with eye icon)
    try {
      if (el.previousElementSibling) {
        labelTexts.push(el.previousElementSibling.innerText || el.previousElementSibling.textContent || '');
      }
      if (el.parentElement && el.parentElement.previousElementSibling) {
        labelTexts.push(el.parentElement.previousElementSibling.innerText || el.parentElement.previousElementSibling.textContent || '');
      }
    } catch (e) {}

    // 6. Surrounding .form-group / .form-row / column / fieldset container (Bootstrap & NIC portals)
    try {
      const container = el.closest('.form-group, .form-row, .row, .col, [class*="col-"], .field, fieldset, [class*="form-"], .input-field, .form-item, tr');
      if (container) {
        const labels = container.querySelectorAll('label, dt, th, .control-label, .form-label, span.label, span, strong, b, legend');
        for (const l of labels) {
          if (!l.contains(el)) {
            const txt = (l.innerText || l.textContent || '').trim();
            if (txt && txt.length < 80) labelTexts.push(txt);
          }
        }
      }
    } catch (e) {}

    // 7. Aria-label, placeholder, title, name, id
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
    if (['checkbox', 'radio', 'submit', 'button', 'reset', 'image'].includes((el.type || '').toLowerCase())) return false;
    const words = [el.name, el.id, el.placeholder, el.getAttribute('aria-label')].filter(Boolean).join(' ');
    if (/captcha|otp|verification/i.test(words)) return false;
    const isIdentityOrBank = /aadhaar|aadhar|adhar|\buid\b|uidai|account|bank|खाता/i.test(words);
    if (el.type === 'password' && !isIdentityOrBank) {
      const surroundingText = (
        (el.parentElement?.innerText || '') + ' ' +
        (el.parentElement?.previousElementSibling?.innerText || '') + ' ' +
        (el.previousElementSibling?.innerText || '') + ' ' +
        (el.closest('tr, .form-group, .row, .col, [class*="col-"], [class*="form-"]')?.innerText || '')
      ).toLowerCase();
      if (!/aadhaar|aadhar|adhar|\buid\b|uidai|account|bank|खाता/.test(surroundingText)) {
        return false;
      }
    }
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
    if (transform === 'digits_only' || map.key === 'aadhaar' || map.key === 'mobile' || map.key === 'pincode') {
      val = val.replace(/\D/g, '');
    } else if (transform === 'uppercase') {
      val = val.toUpperCase();
    } else if (transform === 'date_dmy') {
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
  const heroBtn = $('#heroAutofillBtn');
  const heroBtnTitle = $('#heroBtnTitle');
  const heroBtnCount = $('#heroBtnCount');
  const countBadge = $('#mappingCountBadge');

  if (state.payload) {
    const applicant = state.payload.citizen?.displayName || state.payload.citizen?.fullName || 'Applicant';
    const serviceName = state.payload.application?.serviceName || 'Citizen Service';
    const caseId = state.payload.application?.id || '';

    if (applicantNode) applicantNode.textContent = applicant;
    if (serviceBadge) serviceBadge.textContent = `${serviceName}${caseId ? ` · ${caseId}` : ''}`;
  } else {
    if (applicantNode) applicantNode.textContent = 'Waiting for Case Data';
    if (serviceBadge) serviceBadge.textContent = 'Send from SevaDesk or paste JSON in settings';
  }

  if (state.activeAdapter && portalBadge) {
    portalBadge.textContent = state.activeAdapter.name.replace(/\(.*?\)/, '').trim();
    portalBadge.title = `Adapter: ${state.activeAdapter.name}`;
  }

  const readyCount = state.mappings.filter(m => m.checked && m.index >= 0).length;
  if (countBadge) {
    countBadge.textContent = `${readyCount} Ready`;
    countBadge.className = `count-tag ${readyCount > 0 ? 'good' : ''}`;
  }
  if (heroBtnCount) {
    heroBtnCount.textContent = `${readyCount} Fields`;
  }

  if (readyCount > 0) {
    if (heroBtn) heroBtn.disabled = false;
    if (heroBtnTitle) heroBtnTitle.textContent = 'Fill Form';
  } else if (state.payload) {
    if (heroBtn) heroBtn.disabled = false;
    if (heroBtnTitle) heroBtnTitle.textContent = 'Scan & Fill';
  } else {
    if (heroBtn) heroBtn.disabled = true;
    if (heroBtnTitle) heroBtnTitle.textContent = 'Waiting for Case';
  }
}

async function scanPortalAndBuildMappings() {
  if (state.isScanning) return;
  state.isScanning = true;
  setStatus('Scanning portal form fields…');

  const tab = await currentTab();
  if (!tab?.id) {
    setStatus('Ready (Active tab scanner standby)');
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
      setStatus('No fillable fields detected on this tab', 'warning');
      const rows = $('#mappingRows');
      if (rows) {
        rows.innerHTML = '<div class="empty-state"><p>No portal inputs found. Open form page and click 🔄 Rescan.</p></div>';
      }
      updateHeroPanel();
      state.isScanning = false;
      return;
    }

    setStatus(`${fields.length} controls found. Auto-matching…`);
    buildMappings();
  } catch (error) {
    setStatus('Tab scanned');
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
    container.innerHTML = '<div class="empty-state"><p>No applicant fields loaded.</p></div>';
    return;
  }

  const html = state.mappings.map((m, i) => {
    const isSensitive = ['aadhaar', 'bankAccount'].includes(m.key);
    const displayVal = isSensitive
      ? (m.value.length > 4 ? `••••${m.value.slice(-4)}` : '••••')
      : m.value;

    const selectOptions = [
      `<option value="-1" ${m.index === -1 ? 'selected' : ''}>-- Skip --</option>`,
      ...state.fields.map(f => {
        const isSelected = m.index === f.index;
        return `<option value="${f.index}" ${isSelected ? 'selected' : ''}>${esc(f.label)}</option>`;
      })
    ].join('');

    const matchedField = m.index >= 0 ? state.fields[m.index] : null;
    const targetTitle = matchedField ? `Matched to: ${matchedField.label}` : 'Not mapped';

    return `
      <div class="field-row ${m.checked ? 'is-checked' : ''} ${m.index === -1 ? 'is-unmatched' : ''}">
        <label class="field-label-group">
          <input type="checkbox" class="field-check" data-index="${i}" ${m.checked ? 'checked' : ''} />
          <span class="field-title" title="${esc(m.label)}">${esc(m.label)}</span>
        </label>
        <div class="field-val" title="${esc(m.value)}">${esc(displayVal)}</div>
        <div class="field-target-wrap">
          <select class="target-select" data-index="${i}" title="${esc(targetTitle)}">
            ${selectOptions}
          </select>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  // Add event listeners for checkboxes and select dropdowns
  container.querySelectorAll('.field-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = Number(e.target.dataset.index);
      if (state.mappings[idx]) {
        state.mappings[idx].checked = e.target.checked;
        const row = e.target.closest('.field-row');
        if (row) row.classList.toggle('is-checked', e.target.checked);
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
  setStatus(`${readyCount} of ${state.mappings.length} fields matched & ready`, 'success');
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
    setStatus('Select at least one field to fill', 'error');
    return;
  }

  const tab = await currentTab();
  if (!tab?.id) {
    setStatus('Active tab not found', 'error');
    return;
  }

  state.isFilling = true;
  const heroBtnTitle = $('#heroBtnTitle');
  if (heroBtnTitle) heroBtnTitle.textContent = 'Injecting…';

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
      if (chrome?.storage?.local && state.payload) {
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

    setStatus(`✓ Injected ${report.filled.length} fields in ${elapsed}ms`, 'success');
    if (heroBtnTitle) heroBtnTitle.textContent = 'Fill Again';
  } catch (err) {
    setStatus('Could not fill portal page', 'error');
    updateHeroPanel();
  } finally {
    state.isFilling = false;
  }
}

async function inspectPortalErrors() {
  const tab = await currentTab();
  if (!tab?.id) return;

  const container = $('#portalErrors');
  if (!container) return;
  container.classList.remove('hidden');

  container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>Scanning portal for error alerts…</p></div>';

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageErrors
    });
    const foundErrors = results?.[0]?.result || [];

    if (!foundErrors.length) {
      container.innerHTML = '<div class="feedback-text success" style="padding: 6px 8px;">✓ No visible portal error banners found.</div>';
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
        <div class="error-card">
          <strong>Alert: "${esc(msg)}"</strong>
          ${analysis ? `
            <p>${esc(analysis.explanation)}</p>
            <p style="font-weight:600; color:#1e40af; margin-top:3px;">Action: ${esc(analysis.action)}</p>
          ` : `<p>Review portal field constraints.</p>`}
        </div>
      `;
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div class="feedback-text error" style="padding: 6px 8px;">Could not inspect portal.</div>';
  }
}

function parseManualPayload() {
  const input = $('#payloadInput');
  const raw = input?.value?.trim() || '';
  if (!raw) {
    const statusNode = $('#payloadStatus');
    if (statusNode) statusNode.textContent = 'Please paste JSON payload.';
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const fields = parsed?.citizen?.fields;
    if (parsed?.schemaVersion !== 1 || !fields || typeof fields !== 'object') {
      throw new Error('Expected SevaDesk schemaVersion 1.');
    }
    state.payload = parsed;
    if (input) input.value = '';
    const statusNode = $('#payloadStatus');
    if (statusNode) statusNode.textContent = `Loaded ${Object.keys(fields).length} fields!`;
    updateHeroPanel();
    scanPortalAndBuildMappings();
  } catch (error) {
    const statusNode = $('#payloadStatus');
    if (statusNode) statusNode.textContent = error.message || 'Invalid JSON.';
  }
}

// Event Listeners & Direct Local IPC Bridge
document.addEventListener('DOMContentLoaded', async () => {
  // Main Hero Autofill Button
  $('#heroAutofillBtn')?.addEventListener('click', fillMappedFields);

  // Settings Drawer Toggle
  $('#toggleSettingsBtn')?.addEventListener('click', () => {
    $('#settingsDrawer')?.classList.toggle('hidden');
  });
  $('#closeSettingsBtn')?.addEventListener('click', () => {
    $('#settingsDrawer')?.classList.add('hidden');
  });

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
  $('#inspectErrorsBtn')?.addEventListener('click', () => {
    const container = $('#portalErrors');
    if (container && !container.classList.contains('hidden')) {
      container.classList.add('hidden');
    } else {
      inspectPortalErrors();
    }
  });

  // Manual Payload Actions
  $('#loadPayload')?.addEventListener('click', parseManualPayload);
  $('#clearPayload')?.addEventListener('click', () => {
    const input = $('#payloadInput');
    if (input) input.value = '';
    state.payload = null;
    const statusNode = $('#payloadStatus');
    if (statusNode) statusNode.textContent = 'Cleared.';
    updateHeroPanel();
    renderMappings();
  });

  // Check for cached previous session (Timeout Recovery)
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['lastInjectedSession'], data => {
        const last = data?.lastInjectedSession;
        if (last && last.payload && Date.now() - last.timestamp < 30 * 60 * 1000) {
          const reinjectBtn = $('#reinjectPayload');
          if (reinjectBtn) {
            reinjectBtn.classList.remove('hidden');
            reinjectBtn.textContent = `↺ Restore ${last.applicant || 'session'}`;
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
        if (bridgePill) bridgePill.className = 'status-indicator active';
        if (bridgeText) bridgeText.textContent = 'Ready';
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
        if (bridgePill) bridgePill.className = 'status-indicator clipboard';
        if (bridgeText) bridgeText.textContent = 'Clipboard';
        updateHeroPanel();
        scanPortalAndBuildMappings();
        return;
      }
    }
  } catch {
    // Clipboard not accessible
  }

  // 3. Fallback: No case loaded yet, still scan current page so fields are ready
  if (bridgePill) bridgePill.className = 'status-indicator';
  if (bridgeText) bridgeText.textContent = 'Standby';
  updateHeroPanel();
  scanPortalAndBuildMappings();
});
