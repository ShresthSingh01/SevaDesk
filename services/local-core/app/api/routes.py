import httpx
import time
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, Response, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from ..ocr.engine import document_intelligence
from ..validation.validator import validate_case, validate_citizen
from ..error_interpreter.interpreter import interpret_portal_error
from ..speech.bhashini import bhashini_service
from ..db.repository import Repository, BridgeManager

router = APIRouter(prefix="/api")

class PreflightRequest(BaseModel):
    citizen: Dict[str, Any]
    service: Dict[str, Any]
    documents: Optional[List[Dict[str, Any]]] = None

class ErrorInterpreterRequest(BaseModel):
    message: str
    caseId: Optional[str] = None

class FeeSpeechRequest(BaseModel):
    serviceName: str
    officialFee: Optional[float] = None
    operatorCharge: Optional[float] = None
    language: str = "hi-IN"

class ReadbackSpeechRequest(BaseModel):
    fullName: Optional[str] = None
    dob: Optional[str] = None
    pincode: Optional[str] = None
    maskedId: Optional[str] = None
    language: str = "hi-IN"

class ProfileRequest(BaseModel):
    operatorName: str
    centreName: str
    language: Optional[str] = "hi-IN"
    autoLockMinutes: Optional[int] = 15

class BridgePushRequest(BaseModel):
    payload: Dict[str, Any]
    ttlSeconds: Optional[int] = 120

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "sevadesk-local-core", "version": "2.0.0"}

# --- OCR / Document Intelligence ---
@router.post("/ocr/scan")
async def scan_document(
    file: Optional[UploadFile] = File(None),
    rawTextHint: Optional[str] = Form(None)
):
    image_bytes = b""
    if file:
        image_bytes = await file.read()
    result = document_intelligence.process_image(image_bytes, raw_text_hint=rawTextHint or "")
    Repository.add_audit("document_ocr_run", f"Executed document intelligence scan: {len(result['candidates'])} candidate(s) detected. No raw image persisted.", "document", "scan")
    return result

# --- Explainable Validation ---
@router.post("/preflight/validate")
def preflight_validate(req: PreflightRequest):
    result = validate_case(req.citizen, req.service, req.documents or [])
    return result

# --- Portal Error Interpreter ---
@router.post("/error-interpreter/analyze")
def analyze_portal_error(req: ErrorInterpreterRequest):
    result = interpret_portal_error(req.message)
    if req.caseId:
        Repository.add_audit("portal_error_interpreted", f"Interpreted portal error into category: {result['category']}.", "application", req.caseId)
    return result

# --- Speech / Voice ---
@router.post("/speech/fee-announcement")
def fee_speech(req: FeeSpeechRequest):
    text = bhashini_service.get_fee_speech_text(req.serviceName, req.officialFee, req.operatorCharge, req.language)
    wav_bytes = bhashini_service.synthesize(text, req.language)
    return Response(content=wav_bytes, media_type="audio/wav")

@router.get("/speech/fee-text")
def fee_speech_text(serviceName: str, officialFee: Optional[float] = None, operatorCharge: Optional[float] = None, language: str = "hi-IN"):
    text = bhashini_service.get_fee_speech_text(serviceName, officialFee, operatorCharge, language)
    return {"text": text, "language": language}

@router.post("/speech/readback")
def readback_speech(req: ReadbackSpeechRequest):
    text = bhashini_service.get_readback_speech_text(req.fullName, req.dob, req.pincode, req.maskedId, req.language)
    wav_bytes = bhashini_service.synthesize(text, req.language)
    return Response(content=wav_bytes, media_type="audio/wav")

@router.get("/speech/readback-text")
def readback_speech_text(fullName: Optional[str] = None, dob: Optional[str] = None, pincode: Optional[str] = None, maskedId: Optional[str] = None, language: str = "hi-IN"):
    text = bhashini_service.get_readback_speech_text(fullName, dob, pincode, maskedId, language)
    return {"text": text, "language": language}

# --- Workspace Profile ---
@router.get("/profile")
def get_profile():
    p = Repository.get_profile()
    if not p:
        return {"operatorName": "Operator", "centreName": "Local Centre", "language": "hi-IN", "autoLockMinutes": 15}
    return {
        "id": p["id"],
        "operatorName": p["operator_name"],
        "centreName": p["centre_name"],
        "language": p["default_language"],
        "autoLockMinutes": p["auto_lock_minutes"]
    }

@router.post("/profile")
def update_profile(req: ProfileRequest):
    p = Repository.save_profile(req.operatorName, req.centreName, req.language or "hi-IN", req.autoLockMinutes or 15)
    Repository.add_audit("profile_updated", "Updated workspace operator profile.", "workspace", "local")
    return p

# --- Citizens CRUD ---
@router.get("/citizens")
def list_citizens():
    return Repository.list_citizens()

@router.get("/citizens/{citizen_id}")
def get_citizen(citizen_id: str):
    c = Repository.get_citizen(citizen_id)
    if not c:
        raise HTTPException(status_code=404, detail="Citizen not found.")
    return c

@router.post("/citizens")
def save_citizen(data: Dict[str, Any]):
    try:
        c = Repository.save_citizen(data)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    action = "citizen_updated" if data.get('id') else "citizen_created"
    Repository.add_audit(action, f"Saved citizen details with explicit consent. PII stored via AES-256-GCM.", "citizen", c["id"])
    return c

@router.delete("/citizens/{citizen_id}")
def delete_citizen(citizen_id: str):
    Repository.delete_citizen(citizen_id)
    Repository.add_audit("citizen_deleted", f"Permanently removed citizen and linked cases under Right to Erasure.", "citizen", citizen_id)
    return {"success": True, "deletedId": citizen_id}

# --- Services CRUD ---
@router.get("/services")
def list_services():
    return Repository.list_services()

@router.post("/services")
def save_service(data: Dict[str, Any]):
    s = Repository.save_service(data)
    Repository.add_audit("service_saved", f"Saved scheme rules for: {s.get('name')}.", "service", s.get('id', 'new'))
    return s

# --- Applications CRUD ---
@router.get("/applications")
def list_applications():
    return Repository.list_applications()

@router.post("/applications")
def save_application(data: Dict[str, Any]):
    try:
        app = Repository.save_application(data)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    Repository.add_audit("application_saved", f"Saved case status as {data.get('status')}.", "application", app.get('id', 'new'))
    return app

# --- Audit Log & Cryptographic Verification ---
@router.get("/audit")
def list_audit(limit: int = 500):
    return Repository.list_audit(limit=limit)

@router.get("/audit/verify")
def verify_audit():
    """Mathematically verifies cryptographic hash chain integrity for DPDP Act audit non-repudiation."""
    return Repository.verify_audit_chain()

# --- Direct Local IPC Bridge (Zero OS-Clipboard Dependency) ---
@router.post("/bridge/push-session")
def bridge_push_session(req: BridgePushRequest):
    """Pushes a reviewed application payload to the local daemon in-memory bridge."""
    ticket = BridgeManager.set_active_session(req.payload, ttl_seconds=req.ttlSeconds or 120)
    service_name = req.payload.get("application", {}).get("serviceName", "Service")
    applicant = req.payload.get("citizen", {}).get("displayName", "Applicant")
    Repository.add_audit(
        "bridge_session_dispatched",
        f"Dispatched direct IPC bridge ticket {ticket} for {applicant} ({service_name}). No clipboard used.",
        "bridge",
        ticket
    )
    return {"status": "ok", "ticket": ticket, "expiresInSeconds": req.ttlSeconds or 120}

@router.get("/bridge/active-session")
def bridge_get_session():
    """Chrome Extension Companion polls or reads the active reviewed session directly over loopback."""
    session = BridgeManager.get_active_session()
    if not session:
        return {"active": False, "session": None}
    return {"active": True, "session": session}

@router.delete("/bridge/active-session")
def bridge_clear_session():
    """Clears the active bridge session once injected or canceled."""
    BridgeManager.clear_session()
    return {"status": "cleared"}

# --- Real-Time Portal Latency & Health Probe ---
# In-process cache: keyed by URL, value is (result_dict, timestamp).
# Prevents WAF/IP bans when 10,000+ kiosks poll government portals continuously.
# At 1 request per kiosk per 5 minutes, a 10k-kiosk deployment sends
# ~33 req/sec total instead of ~10,000 req/sec — below any NIC rate limit.
_portal_health_cache: dict = {}
_PORTAL_HEALTH_TTL_SECONDS = 300  # 5 minutes

@router.get("/portal/health")
async def check_portal_health(url: str):
    """
    Measures real network latency and server responsiveness for government portals.
    Empowers operators to detect 504 timeouts, server crashes, and slow peak hours before opening portal tabs.
    Results are cached for 5 minutes per URL to prevent WAF/IP ban risk at scale.
    """
    norm_url = url.strip()
    if not norm_url.startswith(("http://", "https://")):
        norm_url = f"https://{norm_url}"

    # Return cached result if within TTL — WAF ban prevention
    cached = _portal_health_cache.get(norm_url)
    if cached:
        result, cached_at = cached
        age_seconds = time.perf_counter() - cached_at
        if age_seconds < _PORTAL_HEALTH_TTL_SECONDS:
            return {**result, "cached": True, "cacheAgeSeconds": round(age_seconds)}

    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=True, verify=False) as client:
            resp = await client.get(
                norm_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SevaDesk/2.0 Kiosk"}
            )
            elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

            # Congestion classification
            if resp.status_code < 400 and elapsed_ms < 800:
                congestion = "fast"
            elif resp.status_code < 500 and elapsed_ms < 3000:
                congestion = "congested"
            else:
                congestion = "unhealthy"

            result = {
                "url": norm_url,
                "reachable": True,
                "statusCode": resp.status_code,
                "latencyMs": elapsed_ms,
                "congestion": congestion,
                "cached": False,
                "checkedAt": datetime.now(timezone.utc).isoformat()
            }
            _portal_health_cache[norm_url] = (result, time.perf_counter())
            return result
    except httpx.TimeoutException:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        result = {
            "url": norm_url,
            "reachable": False,
            "statusCode": 504,
            "latencyMs": elapsed_ms,
            "congestion": "unhealthy",
            "cached": False,
            "error": "Gateway timeout: government portal server is unresponsive (> 4.0s).",
            "checkedAt": datetime.now(timezone.utc).isoformat()
        }
        _portal_health_cache[norm_url] = (result, time.perf_counter())
        return result
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "url": norm_url,
            "reachable": False,
            "statusCode": None,
            "latencyMs": elapsed_ms,
            "congestion": "offline",
            "cached": False,
            "error": f"Portal connection failed: {str(exc)}",
            "checkedAt": datetime.now(timezone.utc).isoformat()
        }


