import { suggestFieldMatches, FIELD_LABELS, normalizeText } from './lib/core.js';
import { findAdapterByUrl, transformValue } from './lib/adapters.js';

const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const state = {
  payload: null,
  activeAdapter: null,
  fields: [],
  suggestions: [],
  mappings: [],
  lastScan: null
};

function status(id, message, type = '') {
  const node = $(id);
  if (!node) return;
  node.textContent = message;
  node.className = `status-note ${type}`.trim();
}

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function parsePayload() {
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
    $('#payloadInput').placeholder = 'Payload loaded into temporary memory. Clear at any time.';
    const count = Object.values(fields).filter(v => v != null && String(v).trim() !== '').length;
    status('#payloadStatus', `Loaded ${count} field(s) for ${parsed.citizen.displayName || 'applicant'} (${parsed.application?.id || 'case'}).`, 'success');
    $('#scanPage').disabled = false;
    $('#mappingSection').classList.add('hidden');
    state.fields = [];
    state.suggestions = [];
    state.mappings = [];
  } catch (error) {
    status('#payloadStatus', error.message || 'Payload is not valid JSON.', 'error');
  }
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
    if (/captcha|one.?time.?password|\botp\b|verification.?code|security.?code|password|passcode|transaction.?pin/i.test(words)) return false;
    return true;
  });

  return controls.map((el, index) => {
    const labelTexts = [];
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) labelTexts.push(label.innerText || label.textContent || '');
      } catch (e) {}
    }
    if (el.labels) {
      for (const label of el.labels) labelTexts.push(label.innerText || label.textContent || '');
    }
    const wrapper = el.closest('label');
    if (wrapper) labelTexts.push(wrapper.innerText || wrapper.textContent || '');
    let label = [...new Set(labelTexts.map(s => s.trim()).filter(Boolean))].join(' ').replace(/\s+/g, ' ').slice(0, 180);
    if (!label) label = [el.getAttribute('aria-label'), el.placeholder, el.name, el.id].filter(Boolean).join(' ').slice(0, 180);
    if (!label) label = (el.parentElement?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100) || `Field ${index + 1}`;

    // Compute stable DOM selector and check declarative adapter rules
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
      options: el.tagName === 'SELECT' ? [...el.options].filter(o => o.value !== '').slice(0, 60).map(o => ({ value: o.value, label: (o.textContent || '').trim().slice(0, 120) })) : []
    };
  });
}

async function scanPortal() {
  const tab = await currentTab();
  if (!tab?.id) {
    status('#pageStatus', 'Could not locate the active tab.', 'error');
    return;
  }

  // Detect Declarative Adapter
  const adapter = findAdapterByUrl(tab.url || '');
  state.activeAdapter = adapter;

  const badge = $('#adapterBadge');
  if (badge) {
    badge.classList.remove('hidden');
    badge.innerHTML = `<span style="font-size:0.75rem;padding:3px 8px;border-radius:4px;background:#eaf6ed;color:#2f8554;font-weight:700">Adapter: ${esc(adapter.name)} (v${esc(adapter.version)})</span>`;
  }

  status('#pageStatus', 'Scanning visible portal controls…');
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
      status('#pageStatus', 'No fillable controls detected on active tab. Confirm the form is open.', 'warning');
      state.suggestions = [];
      state.mappings = [];
      $('#mappingSection').classList.add('hidden');
      return;
    }

    status('#pageStatus', `${fields.length} visible field(s) detected. Field values were not read.`, 'success');
    buildMappings();
  } catch (error) {
    status('#pageStatus', 'Could not inspect tab. Ensure target page is an HTTP/HTTPS government portal.', 'error');
  }
}

function buildMappings() {
  const dataFields = state.payload?.citizen?.fields || {};
  const suggestions = suggestFieldMatches(dataFields, state.fields);
  const adapter = state.activeAdapter;

  state.suggestions = suggestions;
  state.mappings = suggestions.map(s => {
    let bestIndex = s.suggestedIndex;
    let confidence = s.confidence;

    // Check declarative adapter exact DOM match
    const adapterMatch = state.fields.find(f => (f.matchedAdapterKeys || []).includes(s.key));
    if (adapterMatch) {
      bestIndex = adapterMatch.index;
      confidence = 100;
    }

    return {
      key: s.key,
      index: confidence >= 70 ? bestIndex : -1,
      value: s.value
    };
  });

  $('#mappingSection').classList.remove('hidden');
  const selectedCount = state.mappings.filter(m => m.index >= 0).length;

  $('#mappingSummary').innerHTML = `
    <span class="summary-chip">${suggestions.length} applicant field(s)</span>
    <span class="summary-chip good">${selectedCount} mapped target(s)</span>
    <span class="summary-chip warn">${state.fields.filter(f => f.required).length} required portal field(s)</span>
  `;

  $('#mappingRows').innerHTML = suggestions.length
    ? suggestions.map((s, i) => {
        const mapping = state.mappings[i];
        const conf = s.confidence >= 80 ? 'high' : s.confidence >= 55 ? 'medium' : '';
        const selectOptions = [
          `<option value="-1">Do not fill this field</option>`,
          ...state.fields.map(f => `<option value="${f.index}" ${mapping.index === f.index ? 'selected' : ''}>${esc(f.label)}${f.required ? ' · required' : ''} · ${esc(f.type)}</option>`)
        ].join('');
        const isSensitive = ['aadhaar', 'bankAccount'].includes(s.key);

        return `
          <div class="mapping-row" data-map-row="${esc(s.key)}">
            <div class="mapping-top">
              <strong>${esc(s.label)}</strong>
              <span class="confidence ${conf}">${s.confidence >= 80 ? `Verified match (${s.confidence}%)` : `Review required (${s.confidence}%)`}</span>
            </div>
            <div class="mapping-controls">
              <div>
                <label for="mapTarget-${i}">Target on portal</label>
                <select id="mapTarget-${i}" data-target-key="${esc(s.key)}">${selectOptions}</select>
              </div>
              <div>
                <label for="mapValue-${i}">Value to enter${isSensitive ? ' · sensitive' : ''}</label>
                <input id="mapValue-${i}" data-value-key="${esc(s.key)}" type="${isSensitive ? 'password' : 'text'}" value="${esc(s.value)}" autocomplete="off" />
              </div>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="empty-note">No data fields available.</div>';

  $('#fillFields').disabled = selectedCount === 0;
}

// Injected into portal page: fills reviewed values and triggers framework event dispatchers
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
    if (!el && typeof map.index === 'number') {
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

    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find(o => o.value.toLowerCase() === val.toLowerCase() || o.textContent?.toLowerCase().includes(val.toLowerCase()));
      if (opt) {
        el.value = opt.value;
      }
    } else {
      // Framework-safe setter invocation for React/Angular controlled inputs
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

    // Dispatch synthetic DOM events for ASP.NET / Angular / React
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    report.filled.push(map.key);
  }

  return report;
}

async function fillMappedFields() {
  const map = state.suggestions.map(s => {
    const target = $(`[data-target-key="${CSS.escape(s.key)}"]`);
    const valInput = $(`[data-value-key="${CSS.escape(s.key)}"]`);
    const targetIdx = Number(target?.value ?? -1);
    const targetField = targetIdx >= 0 ? state.fields[targetIdx] : null;

    return {
      key: s.key,
      index: targetIdx,
      id: targetField?.id || '',
      name: targetField?.name || '',
      value: valInput?.value ?? ''
    };
  }).filter(m => m.index >= 0);

  if (!map.length) {
    status('#fillResult', 'Select at least one target portal control.', 'error');
    return;
  }

  const tab = await currentTab();
  if (!tab?.id) return;
  status('#fillResult', 'Burst-injecting reviewed fields…');

  const t0 = performance.now();
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillOnCurrentPage,
      args: [map, state.activeAdapter?.fields || {}]
    });
    const elapsed = Math.round(performance.now() - t0);
    const report = results?.[0]?.result || { filled: [], skipped: [] };

    // Save to quick re-inject cache
    try {
      if (chrome.storage?.local) {
        chrome.storage.local.set({
          lastInjectedSession: {
            applicant: state.payload?.citizen?.displayName || 'Applicant',
            payload: state.payload,
            timestamp: Date.now(),
            count: report.filled.length
          }
        });
      }
    } catch (e) {}

    status('#fillResult', `⚡ Fast Burst: Injected ${report.filled.length} field(s) in ${elapsed}ms! Session active. Review before manual submission.`, 'success');
  } catch (err) {
    status('#fillResult', 'Could not fill page. Rescan and try again.', 'error');
  }
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

async function inspectPortalErrors() {
  const tab = await currentTab();
  if (!tab?.id) return;
  status('#pageStatus', 'Scanning portal page for active error messages…');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageErrors
    });
    const foundErrors = results?.[0]?.result || [];
    const container = $('#portalErrors');
    if (!container) return;

    if (!foundErrors.length) {
      container.innerHTML = '<div class="status-note success" style="margin-top: 8px;">No visible error alerts found on active portal page.</div>';
      status('#pageStatus', 'Inspection complete: no errors detected.');
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
        <div class="error-item" style="margin-top: 8px; padding: 8px 10px; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 6px; font-size: 0.78rem;">
          <div style="font-weight: 700; color: #c53030; margin-bottom: 3px;">Detected: "${esc(msg)}"</div>
          ${analysis ? `
            <div style="color: #2d3748; line-height: 1.35;">
              <strong>${esc(analysis.title || analysis.category)}:</strong> ${esc(analysis.explanation)}
              <div style="margin-top: 4px; font-weight: 600; color: #2b6cb0;">Action: ${esc(analysis.action)}</div>
            </div>
          ` : `<div style="color: #718096;">Rule: Check field constraints and re-verify against source document.</div>`}
        </div>
      `;
    }
    container.innerHTML = html;
    status('#pageStatus', `Detected ${foundErrors.length} portal error(s). Review recommendations below.`, 'warn');
  } catch (err) {
    status('#pageStatus', 'Could not inspect page for errors.', 'error');
  }
}

// Event Listeners & Direct Local IPC Bridge
document.addEventListener('DOMContentLoaded', async () => {
  $('#loadPayload')?.addEventListener('click', parsePayload);
  $('#clearPayload')?.addEventListener('click', () => {
    $('#payloadInput').value = '';
    state.payload = null;
    status('#payloadStatus', 'Payload cleared from memory.');
    $('#scanPage').disabled = true;
    $('#mappingSection').classList.add('hidden');
  });
  $('#scanPage')?.addEventListener('click', scanPortal);
  $('#rescanPage')?.addEventListener('click', scanPortal);
  $('#scanErrors')?.addEventListener('click', inspectPortalErrors);
  $('#fillFields')?.addEventListener('click', fillMappedFields);

  // Check for cached previous session
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
              status('#payloadStatus', `Restored previous session for ${last.applicant || 'applicant'}. Ready to inject.`, 'success');
              $('#scanPage').disabled = false;
              scanPortal();
            });
          }
        }
      });
    }
  } catch (e) {}

  // 1. Primary Direct Loopback IPC Bridge (Zero OS Clipboard PII Exposure)
  try {
    const res = await fetch('http://127.0.0.1:8765/api/bridge/active-session', { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      const data = await res.json();
      if (data.active && data.session?.payload) {
        state.payload = data.session.payload;
        const applicant = state.payload.citizen?.displayName || 'Applicant';
        const service = state.payload.application?.serviceName || 'Service';
        status('#payloadStatus', `Bridge Active: Loaded reviewed data for ${applicant} (${service}).`, 'success');
        $('#payloadInput').placeholder = `Direct Bridge: ${applicant} (${service})`;
        $('#scanPage').disabled = false;
        // Automatically start portal scan
        scanPortal();
        return;
      }
    }
  } catch (err) {
    // Daemon offline or no active session, try secondary clipboard fallback
  }

  // 2. Secondary Clipboard Fallback (if operator copied manually)
  try {
    const clip = await navigator.clipboard.readText();
    if (clip && clip.includes('"schemaVersion"') && clip.includes('"citizen"')) {
      $('#payloadInput').value = clip;
      parsePayload();
    }
  } catch {
    // Clipboard empty or permission not granted
  }
});
