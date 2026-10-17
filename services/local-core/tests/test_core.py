import pytest
from app.core.security import validate_verhoeff, mask_identifier, encrypt_sensitive_field, decrypt_sensitive_field
from app.ocr.engine import document_intelligence
from app.validation.validator import validate_citizen, validate_case
from app.error_interpreter.interpreter import interpret_portal_error
from app.db.database import init_db, get_connection
from app.db.repository import Repository, BridgeManager
from app.speech.bhashini import bhashini_service

@pytest.fixture(autouse=True)
def setup_database():
    init_db()

def test_verhoeff_checksum():
    # Valid Aadhaar numbers pass Verhoeff check (e.g. 200000000013)
    assert validate_verhoeff("200000000013") == True
    assert validate_verhoeff("123456789012") == False
    assert validate_verhoeff("invalid") == False

def test_identifier_masking():
    assert mask_identifier("123456789012") == "••••••••9012"
    assert mask_identifier("") == "Not provided"
    assert mask_identifier(None) == "Not provided"

def test_ocr_candidate_parser():
    sample = """
    GOVERNMENT OF INDIA
    Name: Ramesh Kumar Sharma
    DOB: 15/08/1985
    Gender: Male
    Address: 124 Main Street, Pune, Maharashtra 411001
    Mobile: 9876543210
    2000 0000 0013
    IFSC: SBIN0001234
    """
    candidates = document_intelligence.extract_from_text(sample)
    keys = {c.key: c.value for c in candidates}
    assert keys.get("fullName") == "Ramesh Kumar Sharma"
    assert keys.get("dob") == "1985-08-15"
    assert keys.get("pincode") == "411001"
    assert keys.get("mobile") == "9876543210"
    assert keys.get("aadhaar") == "200000000013"
    assert keys.get("ifsc") == "SBIN0001234"
    assert keys.get("gender") == "Male"

def test_preflight_validation():
    citizen = {
        "fullName": "Priya Patil",
        "dob": "1992-04-12",
        "mobile": "9822012345",
        "pincode": "400001",
        "aadhaar": "200000000018"
    }
    service = {
        "name": "Caste Certificate",
        "requiredFields": ["fullName", "dob", "mobile", "pincode"],
        "maxUploadMB": 2.0,
        "allowedExtensions": ["pdf", "jpg"],
        "portalUrl": "https://edistrict.example.gov.in",
        "officialFee": 30.0,
        "operatorCharge": 20.0,
        "feeSourceUrl": "https://edistrict.example.gov.in/fees",
        "feeVerifiedAt": "2026-01-01"
    }
    documents = [{"name": "ration_card.pdf", "size": 1024 * 500}]
    res = validate_case(citizen, service, documents)
    assert res["valid"] == True
    assert len(res["errors"]) == 0

    # Oversized document triggers blocking error
    oversized = [{"name": "huge_scan.pdf", "size": 5 * 1024 * 1024}]
    res2 = validate_case(citizen, service, oversized)
    assert res2["valid"] == False
    assert any("exceeds" in e["message"] for e in res2["errors"])

def test_portal_error_interpretation():
    msg = "File size exceeded limit"
    interp = interpret_portal_error(msg)
    assert interp["category"] == "Document upload"
    assert interp["confidence"] == "heuristic"

    unknown = "XG792_INTERNAL_OP_CODE_UNHANDLED"
    interp_unknown = interpret_portal_error(unknown)
    assert interp_unknown["category"] == "Unmapped message"
    assert interp_unknown["confidence"] == "none"

def test_repository_crud():
    citizen = Repository.save_citizen({
        "fullName": "Amit Deshmukh",
        "mobile": "9811122233",
        "district": "Nagpur",
        "consentPurpose": "Welfare assistance"
    })
    assert citizen["id"] is not None
    assert citizen["fullName"] == "Amit Deshmukh"

    citizens = Repository.list_citizens()
    assert any(c["id"] == citizen["id"] for c in citizens)

    Repository.delete_citizen(citizen["id"])
    assert Repository.get_citizen(citizen["id"]) is None

def test_at_rest_encryption():
    # Save citizen with sensitive Aadhaar and bank details
    test_aadhaar = "200000000013"
    test_bank = "1234567890123"
    saved = Repository.save_citizen({
        "fullName": "Encryption Verification",
        "aadhaar": test_aadhaar,
        "bankAccount": test_bank,
        "consentPurpose": "Audit verification"
    })
    citizen_id = saved["id"]

    # 1. Directly query SQLite database at low level
    conn = get_connection()
    row = conn.execute("SELECT aadhaar_encrypted, bank_account_encrypted FROM citizens WHERE id = ?;", (citizen_id,)).fetchone()
    conn.close()

    # The raw database column MUST NOT be plaintext
    raw_aadhaar_in_db = row["aadhaar_encrypted"]
    raw_bank_in_db = row["bank_account_encrypted"]
    assert test_aadhaar not in raw_aadhaar_in_db
    assert test_bank not in raw_bank_in_db

    # 2. Reading through Repository MUST decrypt back to plaintext
    loaded = Repository.get_citizen(citizen_id)
    assert loaded["aadhaar"] == test_aadhaar
    assert loaded["bankAccount"] == test_bank

    Repository.delete_citizen(citizen_id)

def test_hash_chained_audit_ledger():
    # Clear any previous test artifacts
    conn = get_connection()
    conn.execute("DELETE FROM audit_log WHERE entity_type = 'test_fixture';")
    conn.commit()
    conn.close()

    evt1 = Repository.add_audit("test_action_1", "First audit entry", "test_fixture", "1")
    evt2 = Repository.add_audit("test_action_2", "Second audit entry", "test_fixture", "2")

    # Integrity verification must pass
    verification = Repository.verify_audit_chain()
    assert verification["valid"] == True
    assert verification["count"] >= 2

    # Simulate malicious database tampering on raw sqlite row
    conn = get_connection()
    conn.execute("UPDATE audit_log SET description = 'TAMPERED DESCRIPTION' WHERE id = ?;", (evt1,))
    conn.commit()
    conn.close()

    # Integrity verification must detect tamper
    tamper_check = Repository.verify_audit_chain()
    assert tamper_check["valid"] == False
    assert tamper_check["tamperedId"] == evt1

    # Cleanup tampered test records so future runs and database stay pristine
    conn = get_connection()
    conn.execute("DELETE FROM audit_log WHERE entity_type = 'test_fixture';")
    conn.commit()
    conn.close()

def test_bridge_session_manager():
    payload = {
        "application": {"id": "APP-1", "serviceName": "Income Certificate"},
        "citizen": {"displayName": "Sanjay Verma", "fields": {"fullName": "Sanjay Verma", "dob": "1990-01-01"}}
    }
    ticket = BridgeManager.set_active_session(payload, ttl_seconds=60)
    assert ticket.startswith("TKT-")

    active = BridgeManager.get_active_session()
    assert active is not None
    assert active["ticket"] == ticket
    assert active["payload"]["citizen"]["displayName"] == "Sanjay Verma"

    BridgeManager.clear_session()
    assert BridgeManager.get_active_session() is None

def test_speech_generation():
    text = bhashini_service.get_fee_speech_text("Income Certificate", 40.0, 25.0, "hi")
    assert "सरकारी पोर्टल शुल्क: 40.00" in text
    assert "केंद्र सेवा शुल्क: 25.00" in text
    wav_bytes = bhashini_service.synthesize(text, "hi")
    assert len(wav_bytes) > 44  # Valid WAV header and data

def test_readback_speech_generation():
    hi_text = bhashini_service.get_readback_speech_text("Ramesh Kumar", "1985-08-15", "411001", "••••••••0013", "hi")
    assert "पहचान सत्यापन" in hi_text
    assert "Ramesh Kumar" in hi_text
    assert "1985-08-15" in hi_text
    assert "411001" in hi_text

    mr_text = bhashini_service.get_readback_speech_text("Ramesh Kumar", "1985-08-15", "411001", "••••••••0013", "mr")
    assert "ओळख पडताळणी" in mr_text

    en_text = bhashini_service.get_readback_speech_text("Ramesh Kumar", "1985-08-15", "411001", "••••••••0013", "en")
    assert "Identity verification" in en_text
