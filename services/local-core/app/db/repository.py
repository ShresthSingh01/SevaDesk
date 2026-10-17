import json
import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from .database import get_connection
from ..core.security import (
    encrypt_sensitive_field,
    decrypt_sensitive_field,
    compute_entry_hash,
    mask_identifier
)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class BridgeManager:
    """Thread-safe in-memory session bridge between Local Workstation and Chrome Extension."""
    _session: Optional[Dict[str, Any]] = None

    @classmethod
    def set_active_session(cls, payload: Dict[str, Any], ttl_seconds: int = 120) -> str:
        ticket = f"TKT-{uuid.uuid4().hex[:12].upper()}"
        cls._session = {
            "ticket": ticket,
            "payload": payload,
            "createdAt": time.time(),
            "expiresAt": time.time() + ttl_seconds
        }
        return ticket

    @classmethod
    def get_active_session(cls) -> Optional[Dict[str, Any]]:
        if not cls._session:
            return None
        if time.time() > cls._session['expiresAt']:
            cls._session = None
            return None
        return cls._session

    @classmethod
    def clear_session(cls):
        cls._session = None

class Repository:
    @staticmethod
    def get_profile() -> Optional[Dict[str, Any]]:
        conn = get_connection()
        row = conn.execute("SELECT * FROM operator_profile LIMIT 1;").fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def save_profile(operator_name: str, centre_name: str, language: str = 'hi-IN', auto_lock_minutes: int = 15) -> Dict[str, Any]:
        conn = get_connection()
        now = now_iso()
        existing = conn.execute("SELECT id FROM operator_profile LIMIT 1;").fetchone()
        if existing:
            conn.execute(
                "UPDATE operator_profile SET operator_name = ?, centre_name = ?, default_language = ?, auto_lock_minutes = ?, updated_at = ? WHERE id = ?;",
                (operator_name, centre_name, language, auto_lock_minutes, now, existing['id'])
            )
            profile_id = existing['id']
        else:
            profile_id = 'OPR-1'
            conn.execute(
                "INSERT INTO operator_profile (id, operator_name, centre_name, default_language, auto_lock_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);",
                (profile_id, operator_name, centre_name, language, auto_lock_minutes, now, now)
            )
        conn.commit()
        conn.close()
        return {"id": profile_id, "operatorName": operator_name, "centreName": centre_name, "language": language, "autoLockMinutes": auto_lock_minutes}

    @staticmethod
    def _format_citizen_out(row: Any) -> Dict[str, Any]:
        d = dict(row)
        return {
            "id": d["id"],
            "fullName": d.get("full_name") or "",
            "dob": d.get("dob") or "",
            "gender": d.get("gender") or "",
            "mobile": d.get("mobile") or "",
            "email": d.get("email") or "",
            "address": d.get("address") or "",
            "state": d.get("state") or "",
            "district": d.get("district") or "",
            "pincode": d.get("pincode") or "",
            "aadhaar": decrypt_sensitive_field(d.get("aadhaar_encrypted")),
            "voterId": decrypt_sensitive_field(d.get("voter_id_encrypted")),
            "rationCard": decrypt_sensitive_field(d.get("ration_card_encrypted")),
            "bankAccount": decrypt_sensitive_field(d.get("bank_account_encrypted")),
            "ifsc": d.get("ifsc") or "",
            "consentAt": d.get("consent_given_at") or "",
            "consentPurpose": d.get("consent_purpose") or "",
            "createdAt": d.get("created_at") or "",
            "updatedAt": d.get("updated_at") or ""
        }

    @staticmethod
    def list_citizens() -> List[Dict[str, Any]]:
        conn = get_connection()
        rows = conn.execute("SELECT * FROM citizens ORDER BY updated_at DESC;").fetchall()
        conn.close()
        return [Repository._format_citizen_out(r) for r in rows]

    @staticmethod
    def get_citizen(citizen_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        row = conn.execute("SELECT * FROM citizens WHERE id = ?;", (citizen_id,)).fetchone()
        conn.close()
        return Repository._format_citizen_out(row) if row else None

    @staticmethod
    def save_citizen(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        now = now_iso()
        citizen_id = data.get('id')
        existing = conn.execute("SELECT id FROM citizens WHERE id = ?;", (citizen_id,)).fetchone() if citizen_id else None

        # Real AES-256-GCM encryption for sensitive columns
        enc_aadhaar = encrypt_sensitive_field(data.get('aadhaar', ''))
        enc_voter = encrypt_sensitive_field(data.get('voterId', ''))
        enc_ration = encrypt_sensitive_field(data.get('rationCard', ''))
        enc_bank = encrypt_sensitive_field(data.get('bankAccount', ''))

        if existing:
            conn.execute("""
                UPDATE citizens SET
                    full_name = ?, dob = ?, gender = ?, mobile = ?, email = ?,
                    address = ?, state = ?, district = ?, pincode = ?,
                    aadhaar_encrypted = ?, voter_id_encrypted = ?, ration_card_encrypted = ?,
                    bank_account_encrypted = ?, ifsc = ?, consent_given_at = ?, consent_purpose = ?,
                    updated_at = ?
                WHERE id = ?;
            """, (
                data.get('fullName', ''), data.get('dob', ''), data.get('gender', ''), data.get('mobile', ''), data.get('email', ''),
                data.get('address', ''), data.get('state', ''), data.get('district', ''), data.get('pincode', ''),
                enc_aadhaar, enc_voter, enc_ration, enc_bank,
                data.get('ifsc', ''), data.get('consentAt', now), data.get('consentPurpose', ''),
                now, citizen_id
            ))
        else:
            if not citizen_id:
                citizen_id = f"CIT-{uuid.uuid4().hex[:8].upper()}"
            conn.execute("""
                INSERT INTO citizens (
                    id, full_name, dob, gender, mobile, email, address, state, district, pincode,
                    aadhaar_encrypted, voter_id_encrypted, ration_card_encrypted, bank_account_encrypted,
                    ifsc, consent_given_at, consent_purpose, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                citizen_id, data.get('fullName', ''), data.get('dob', ''), data.get('gender', ''), data.get('mobile', ''), data.get('email', ''),
                data.get('address', ''), data.get('state', ''), data.get('district', ''), data.get('pincode', ''),
                enc_aadhaar, enc_voter, enc_ration, enc_bank,
                data.get('ifsc', ''), data.get('consentAt', now), data.get('consentPurpose', ''),
                now, now
            ))

        conn.commit()
        conn.close()
        return Repository.get_citizen(citizen_id)

    @staticmethod
    def delete_citizen(citizen_id: str) -> bool:
        conn = get_connection()
        conn.execute("DELETE FROM applications WHERE citizen_id = ?;", (citizen_id,))
        conn.execute("DELETE FROM citizens WHERE id = ?;", (citizen_id,))
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def list_services() -> List[Dict[str, Any]]:
        conn = get_connection()
        rows = conn.execute("SELECT * FROM service_definitions ORDER BY name ASC;").fetchall()
        conn.close()
        results = []
        for r in rows:
            d = dict(r)
            if d.get('allowed_extensions'):
                d['allowedExtensions'] = [x.strip() for x in d['allowed_extensions'].split(',') if x.strip()]
            else:
                d['allowedExtensions'] = []
            if d.get('required_fields'):
                try:
                    d['requiredFields'] = json.loads(d['required_fields'])
                except Exception:
                    d['requiredFields'] = []
            else:
                d['requiredFields'] = []
            d['officialFee'] = d.pop('official_fee')
            d['operatorCharge'] = d.pop('operator_charge')
            d['feeSourceUrl'] = d.pop('fee_source_url')
            d['feeVerifiedAt'] = d.pop('fee_verified_at')
            d['maxUploadMB'] = d.pop('max_upload_mb')
            d['portalUrl'] = d.pop('portal_url')
            results.append(d)
        return results

    @staticmethod
    def save_service(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        now = now_iso()
        service_id = data.get('id')
        existing = conn.execute("SELECT id FROM service_definitions WHERE id = ?;", (service_id,)).fetchone() if service_id else None

        req_fields_json = json.dumps(data.get('requiredFields', []))
        allowed_ext_str = ','.join(data.get('allowedExtensions', []))

        if existing:
            conn.execute("""
                UPDATE service_definitions SET
                    name = ?, department = ?, portal_url = ?, official_fee = ?, operator_charge = ?,
                    fee_source_url = ?, fee_verified_at = ?, max_upload_mb = ?, allowed_extensions = ?,
                    required_fields = ?, adapter_id = ?, notes = ?, updated_at = ?
                WHERE id = ?;
            """, (
                data.get('name', ''), data.get('department', ''), data.get('portalUrl', ''),
                data.get('officialFee'), data.get('operatorCharge'), data.get('feeSourceUrl', ''),
                data.get('feeVerifiedAt', ''), data.get('maxUploadMB'), allowed_ext_str,
                req_fields_json, data.get('adapterId', ''), data.get('notes', ''), now, service_id
            ))
        else:
            if not service_id:
                service_id = f"SRV-{uuid.uuid4().hex[:8].upper()}"
            conn.execute("""
                INSERT INTO service_definitions (
                    id, name, department, portal_url, official_fee, operator_charge,
                    fee_source_url, fee_verified_at, max_upload_mb, allowed_extensions,
                    required_fields, adapter_id, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                service_id, data.get('name', ''), data.get('department', ''), data.get('portalUrl', ''),
                data.get('officialFee'), data.get('operatorCharge'), data.get('feeSourceUrl', ''),
                data.get('feeVerifiedAt', ''), data.get('maxUploadMB'), allowed_ext_str,
                req_fields_json, data.get('adapterId', ''), data.get('notes', ''), now, now
            ))

        conn.commit()
        conn.close()
        return data

    @staticmethod
    def list_applications() -> List[Dict[str, Any]]:
        conn = get_connection()
        rows = conn.execute("SELECT * FROM applications ORDER BY updated_at DESC;").fetchall()
        conn.close()
        out = []
        for r in rows:
            d = dict(r)
            if d.get('preflight_snapshot'):
                try:
                    d['preflight'] = json.loads(d['preflight_snapshot'])
                except Exception:
                    d['preflight'] = None
            else:
                d['preflight'] = None
            d['citizenId'] = d.pop('citizen_id')
            d['serviceId'] = d.pop('service_id')
            d['receiptRef'] = d.pop('receipt_reference')
            d['statusNote'] = d.pop('operator_notes')
            d['portalErrorCategory'] = d.pop('portal_error_category')
            d['createdAt'] = d.pop('created_at')
            d['updatedAt'] = d.pop('updated_at')
            out.append(d)
        return out

    @staticmethod
    def save_application(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        now = now_iso()
        app_id = data.get('id')
        existing = conn.execute("SELECT id FROM applications WHERE id = ?;", (app_id,)).fetchone() if app_id else None
        preflight_json = json.dumps(data.get('preflight')) if data.get('preflight') else None

        if existing:
            conn.execute("""
                UPDATE applications SET
                    status = ?, receipt_reference = ?, operator_notes = ?, preflight_snapshot = ?,
                    portal_error_category = ?, updated_at = ?
                WHERE id = ?;
            """, (
                data.get('status', 'draft'), data.get('receiptRef', ''), data.get('statusNote', ''),
                preflight_json, data.get('portalErrorCategory', ''), now, app_id
            ))
        else:
            if not app_id:
                app_id = f"SD-{uuid.uuid4().hex[:8].upper()}"
            conn.execute("""
                INSERT INTO applications (
                    id, citizen_id, service_id, status, receipt_reference, operator_notes,
                    preflight_snapshot, portal_error_category, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                app_id, data.get('citizenId'), data.get('serviceId'), data.get('status', 'draft'),
                data.get('receiptRef', ''), data.get('statusNote', ''), preflight_json,
                data.get('portalErrorCategory', ''), now, now
            ))

        conn.commit()
        conn.close()
        return data

    @staticmethod
    def add_audit(action: str, description: str, entity_type: str = 'workspace', entity_id: str = 'local') -> str:
        """Adds a tamper-evident audit event with SHA-256 cryptographic hash-chaining."""
        conn = get_connection()
        event_id = f"EVT-{uuid.uuid4().hex[:8].upper()}"
        now = now_iso()

        # Retrieve previous entry_hash from the tail of the ledger
        latest = conn.execute("SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1;").fetchone()
        previous_hash = (latest["entry_hash"] if (latest and latest["entry_hash"]) else ("0" * 64))

        entry_hash = compute_entry_hash(previous_hash, now, action, entity_type, entity_id, description)

        conn.execute(
            "INSERT INTO audit_log (id, timestamp, action, description, entity_type, entity_id, previous_hash, entry_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
            (event_id, now, action, description, entity_type, entity_id, previous_hash, entry_hash)
        )
        conn.commit()
        conn.close()
        return event_id

    @staticmethod
    def list_audit(limit: int = 500) -> List[Dict[str, Any]]:
        conn = get_connection()
        rows = conn.execute("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?;", (limit,)).fetchall()
        conn.close()
        return [
            {
                "id": r["id"],
                "timestamp": r["timestamp"],
                "action": r["action"],
                "description": r["description"],
                "entityType": r["entity_type"],
                "entityId": r["entity_id"],
                "previousHash": r["previous_hash"] if "previous_hash" in r.keys() else "",
                "entryHash": r["entry_hash"] if "entry_hash" in r.keys() else ""
            }
            for r in rows
        ]

    @staticmethod
    def verify_audit_chain() -> Dict[str, Any]:
        """Mathematically verifies cryptographic integrity across the entire audit ledger."""
        conn = get_connection()
        rows = conn.execute("SELECT * FROM audit_log ORDER BY rowid ASC;").fetchall()
        conn.close()
        if not rows:
            return {"valid": True, "count": 0, "chainHead": "0" * 64, "message": "Audit ledger is empty."}

        expected_prev = "0" * 64
        for idx, r in enumerate(rows):
            prev_hash = r["previous_hash"] if "previous_hash" in r.keys() else ""
            entry_hash = r["entry_hash"] if "entry_hash" in r.keys() else ""

            if prev_hash != expected_prev:
                return {
                    "valid": False,
                    "tamperedId": r["id"],
                    "error": f"Chain broken at record #{idx + 1} ({r['id']}): previous_hash mismatch.",
                    "expected": expected_prev,
                    "found": prev_hash
                }

            recomputed = compute_entry_hash(
                prev_hash, r["timestamp"], r["action"],
                r["entity_type"], r["entity_id"], r["description"]
            )
            if entry_hash != recomputed:
                return {
                    "valid": False,
                    "tamperedId": r["id"],
                    "error": f"Cryptographic tamper detected at record #{idx + 1} ({r['id']}): entry_hash mismatch.",
                    "expected": recomputed,
                    "found": entry_hash
                }
            expected_prev = entry_hash

        return {
            "valid": True,
            "count": len(rows),
            "chainHead": expected_prev,
            "message": f"Cryptographic integrity verified across all {len(rows)} events."
        }
