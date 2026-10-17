import os
import base64
import re
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
]

VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
]

def validate_verhoeff(num_str: str) -> bool:
    """Validates 12-digit UIDAI Aadhaar number via standard Verhoeff checksum algorithm."""
    digits = re.sub(r'\D', '', str(num_str or ''))
    if len(digits) != 12:
        return False
    c = 0
    reversed_digits = [int(d) for d in reversed(digits)]
    for i, digit in enumerate(reversed_digits):
        c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digit]]
    return c == 0

def mask_identifier(value: Optional[str], visible: int = 4) -> str:
    """Masks sensitive numbers like Aadhaar or bank account outside edit screens."""
    raw = str(value or '').strip()
    if not raw:
        return 'Not provided'
    if len(raw) <= visible:
        return '•' * max(0, len(raw) - 1) + raw[-1:]
    return f"{'•' * max(4, len(raw) - visible)}{raw[-visible:]}"

def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derives AES-256 key using PBKDF2 with SHA-256 (310,000 iterations)."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=310000,
    )
    return kdf.derive(passphrase.encode('utf-8'))

def encrypt_text(text: str, key: bytes) -> str:
    """Encrypts plaintext string with AES-256-GCM and returns base64 envelope."""
    if not text:
        return ""
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, text.encode('utf-8'), None)
    payload = iv + ciphertext
    return base64.b64encode(payload).decode('utf-8')

def decrypt_text(payload_b64: str, key: bytes) -> str:
    """Decrypts base64 AES-256-GCM envelope."""
    if not payload_b64:
        return ""
    try:
        data = base64.b64decode(payload_b64)
        if len(data) < 28: # 12 IV + 16 auth tag minimum
            return payload_b64
        iv = data[:12]
        ciphertext = data[12:]
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(iv, ciphertext, None)
        return decrypted.decode('utf-8')
    except Exception:
        # If decryption fails (e.g. legacy plaintext), return as-is
        return payload_b64

_KIOSK_KEY_CACHE: Optional[bytes] = None

def get_kiosk_key() -> bytes:
    """Retrieves or creates the local kiosk master key for SQLite at-rest encryption."""
    global _KIOSK_KEY_CACHE
    if _KIOSK_KEY_CACHE is not None:
        return _KIOSK_KEY_CACHE

    from .config import DATA_DIR
    key_path = DATA_DIR / "kiosk_master.key"
    if key_path.exists():
        _KIOSK_KEY_CACHE = key_path.read_bytes()
    else:
        # Generate 32-byte cryptographic random key
        new_key = os.urandom(32)
        key_path.write_bytes(new_key)
        _KIOSK_KEY_CACHE = new_key
    return _KIOSK_KEY_CACHE

def encrypt_sensitive_field(text: Optional[str]) -> str:
    """Encrypts a sensitive field with the Kiosk Master Key using AES-256-GCM."""
    if not text:
        return ""
    val = str(text).strip()
    if not val:
        return ""
    # Avoid re-encrypting if already a valid base64 envelope
    try:
        raw = base64.b64decode(val)
        if len(raw) > 28 and val.endswith('='):
            # Check if decryptable
            test_dec = decrypt_text(val, get_kiosk_key())
            if test_dec and test_dec != "[Decryption failed]" and test_dec != val:
                return val
    except Exception:
        pass
    return encrypt_text(val, get_kiosk_key())

def decrypt_sensitive_field(payload: Optional[str]) -> str:
    """Decrypts a sensitive field with the Kiosk Master Key using AES-256-GCM."""
    if not payload:
        return ""
    val = str(payload).strip()
    if not val:
        return ""
    return decrypt_text(val, get_kiosk_key())

def compute_entry_hash(previous_hash: str, timestamp: str, action: str, entity_type: str, entity_id: str, description: str) -> str:
    """Computes SHA-256 hash for cryptographic audit chain."""
    import hashlib
    data = f"{previous_hash}|{timestamp}|{action}|{entity_type}|{entity_id}|{description}".encode('utf-8')
    return hashlib.sha256(data).hexdigest()
