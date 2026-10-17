const PBKDF2_ITERATIONS = 310000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVault(data: any, key: CryptoKey, salt: Uint8Array) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const clear = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as any }, key, clear);
  return {
    schema: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString()
  };
}

export async function decryptVault(envelope: any, passphrase: string) {
  if (
    !envelope ||
    envelope.schema !== 1 ||
    envelope.kdf !== 'PBKDF2-SHA256' ||
    !envelope.salt ||
    !envelope.iv ||
    !envelope.ciphertext
  ) {
    throw new TypeError('Unsupported or malformed encrypted vault envelope.');
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) {
    throw new TypeError('Malformed encrypted vault parameters.');
  }
  const key = await deriveVaultKey(passphrase, salt);
  const clear = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    base64ToBytes(envelope.ciphertext) as any
  );
  return { key, data: JSON.parse(new TextDecoder().decode(clear)), salt };
}
