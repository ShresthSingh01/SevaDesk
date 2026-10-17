const LOCAL_API_BASE = 'http://127.0.0.1:8765/api';

export async function checkDaemonHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/health`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestOcrScan(file: File | null, rawTextHint: string = '') {
  const formData = new FormData();
  if (file) formData.append('file', file);
  if (rawTextHint) formData.append('rawTextHint', rawTextHint);

  const res = await fetch(`${LOCAL_API_BASE}/ocr/scan`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('OCR scan failed on local daemon.');
  return await res.json();
}

export async function requestPortalErrorInterpretation(message: string, caseId?: string) {
  const res = await fetch(`${LOCAL_API_BASE}/error-interpreter/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, caseId })
  });
  if (!res.ok) throw new Error('Portal error interpretation request failed.');
  return await res.json();
}

export async function requestFeeSpeechWav(serviceName: string, officialFee?: number | null, operatorCharge?: number | null, language: string = 'hi-IN'): Promise<Blob> {
  const res = await fetch(`${LOCAL_API_BASE}/speech/fee-announcement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName, officialFee, operatorCharge, language })
  });
  if (!res.ok) throw new Error('Audio synthesis failed.');
  return await res.blob();
}

// --- Live SQLite Sync on Local Core Daemon ---
export async function syncCitizenToDaemon(citizen: any) {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/citizens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(citizen)
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.warn('SQLite citizen sync offline:', err);
    return null;
  }
}

export async function deleteCitizenFromDaemon(citizenId: string) {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/citizens/${encodeURIComponent(citizenId)}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (err) {
    console.warn('SQLite citizen delete offline:', err);
    return false;
  }
}

export async function syncServiceToDaemon(service: any) {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(service)
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.warn('SQLite service sync offline:', err);
    return null;
  }
}

export async function syncApplicationToDaemon(app: any) {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app)
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.warn('SQLite application sync offline:', err);
    return null;
  }
}

export async function fetchCitizensFromDaemon() {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/citizens`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export async function fetchServicesFromDaemon() {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/services`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export async function fetchApplicationsFromDaemon() {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/applications`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

// --- Direct Loopback IPC Bridge ---
export async function pushBridgeSession(payload: any) {
  const res = await fetch(`${LOCAL_API_BASE}/bridge/push-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, ttlSeconds: 120 })
  });
  if (!res.ok) throw new Error('Failed to dispatch session to local IPC bridge.');
  return await res.json();
}

export async function fetchActiveBridgeSession() {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/bridge/active-session`);
    return res.ok ? await res.json() : { active: false, session: null };
  } catch {
    return { active: false, session: null };
  }
}

export async function clearBridgeSession() {
  try {
    await fetch(`${LOCAL_API_BASE}/bridge/active-session`, { method: 'DELETE' });
  } catch {}
}

export async function verifyAuditLedger() {
  const res = await fetch(`${LOCAL_API_BASE}/audit/verify`);
  if (!res.ok) throw new Error('Audit verification request failed.');
  return await res.json();
}
