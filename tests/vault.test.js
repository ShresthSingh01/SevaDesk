import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { deriveVaultKey, encryptVault, decryptVault } from '../packages/core-types/index.js';

// Use Node's standard Web Crypto implementation for deterministic test coverage.
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const sampleData = {
  schemaVersion: 1,
  profile: { operatorName: 'Test Operator', centreName: 'Test Centre' },
  citizens: [{ id: 'CIT-TEST', fullName: 'Example Citizen', aadhaar: '123456789012' }],
  applications: []
};

test('vault ciphertext does not expose citizen fields and decrypts with the correct passphrase', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey('strong-test-passphrase', salt);
  const envelope = await encryptVault(sampleData, key, salt);
  assert.equal(envelope.kdf, 'PBKDF2-SHA256');
  assert.equal(envelope.iterations, 310000);
  assert.equal(envelope.iv.length > 0, true);
  assert.equal(JSON.stringify(envelope).includes('Example Citizen'), false);
  assert.equal(JSON.stringify(envelope).includes('123456789012'), false);
  const restored = await decryptVault(envelope, 'strong-test-passphrase');
  assert.deepEqual(restored.data, sampleData);
});

test('vault decryption rejects a wrong passphrase and modified ciphertext', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey('strong-test-passphrase', salt);
  const envelope = await encryptVault(sampleData, key, salt);
  await assert.rejects(() => decryptVault(envelope, 'wrong-passphrase'));
  const corrupted = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + 'AAAA' };
  await assert.rejects(() => decryptVault(corrupted, 'strong-test-passphrase'));
});

test('each vault save uses a fresh random AES-GCM IV', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey('strong-test-passphrase', salt);
  const one = await encryptVault(sampleData, key, salt);
  const two = await encryptVault(sampleData, key, salt);
  assert.notEqual(one.iv, two.iv);
});
