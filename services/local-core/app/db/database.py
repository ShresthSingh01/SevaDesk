import sqlite3
from pathlib import Path
from ..core.config import settings

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS operator_profile (
        id TEXT PRIMARY KEY,
        operator_name TEXT NOT NULL,
        centre_name TEXT NOT NULL,
        default_language TEXT DEFAULT 'hi-IN',
        auto_lock_minutes INTEGER DEFAULT 15,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS citizens (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        dob TEXT,
        gender TEXT,
        mobile TEXT,
        email TEXT,
        address TEXT,
        state TEXT,
        district TEXT,
        pincode TEXT,
        aadhaar_encrypted TEXT,
        voter_id_encrypted TEXT,
        ration_card_encrypted TEXT,
        bank_account_encrypted TEXT,
        ifsc TEXT,
        consent_given_at TEXT NOT NULL,
        consent_purpose TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT,
        portal_url TEXT,
        official_fee REAL,
        operator_charge REAL,
        fee_source_url TEXT,
        fee_verified_at TEXT,
        max_upload_mb REAL,
        allowed_extensions TEXT,
        required_fields TEXT,
        adapter_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        citizen_id TEXT NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
        service_id TEXT NOT NULL REFERENCES service_definitions(id),
        status TEXT NOT NULL,
        receipt_reference TEXT,
        operator_notes TEXT,
        preflight_snapshot TEXT,
        portal_error_category TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        previous_hash TEXT NOT NULL DEFAULT '',
        entry_hash TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_apps_citizen ON applications(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_apps_service ON applications(service_id);
    """)

    # Schema migration checks for existing tables
    try:
        cursor.execute("SELECT previous_hash FROM audit_log LIMIT 1;")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE audit_log ADD COLUMN previous_hash TEXT NOT NULL DEFAULT '';")
        cursor.execute("ALTER TABLE audit_log ADD COLUMN entry_hash TEXT NOT NULL DEFAULT '';")

    # Backfill legacy audit rows if any exist with empty entry_hash
    legacy_rows = cursor.execute("SELECT id, timestamp, action, entity_type, entity_id, description FROM audit_log WHERE entry_hash = '' ORDER BY rowid ASC;").fetchall()
    if legacy_rows:
        from ..core.security import compute_entry_hash
        latest = cursor.execute("SELECT entry_hash FROM audit_log WHERE entry_hash != '' ORDER BY rowid DESC LIMIT 1;").fetchone()
        prev = latest[0] if (latest and latest[0]) else ("0" * 64)
        for row in legacy_rows:
            h = compute_entry_hash(prev, row[1], row[2], row[3], row[4], row[5])
            cursor.execute("UPDATE audit_log SET previous_hash = ?, entry_hash = ? WHERE id = ?;", (prev, h, row[0]))
            prev = h

    conn.commit()
    conn.close()
