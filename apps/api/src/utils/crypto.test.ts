import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  // Minimal env for getEnv() inside crypto.ts.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
  process.env.OTP_VERIFIED_TOKEN_SECRET = 'c'.repeat(32);
  process.env.PII_ENCRYPTION_KEY = 'test-pii-encryption-key-1234567890';
});

describe('PII crypto', () => {
  it('round-trips a phone number', async () => {
    const { encryptPii, decryptPii } = await import('./crypto.js');
    const original = '+919876543210';
    const ct = encryptPii(original);
    expect(ct).toMatch(/^v1:/);
    expect(ct).not.toContain(original);
    expect(decryptPii(ct)).toBe(original);
  });

  it('produces different ciphertext on each call (random IV)', async () => {
    const { encryptPii } = await import('./crypto.js');
    const a = encryptPii('+919876543210');
    const b = encryptPii('+919876543210');
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', async () => {
    const { encryptPii, decryptPii } = await import('./crypto.js');
    const ct = encryptPii('rider@example.com');
    // Flip the last byte of the ciphertext segment.
    const lastChar = ct.charAt(ct.length - 2);
    const tampered = ct.slice(0, -2) + (lastChar === 'A' ? 'B' : 'A') + ct.slice(-1);
    expect(() => decryptPii(tampered)).toThrow();
  });

  it('masks phone keeping country code + first 5 digits', async () => {
    const { maskPhone } = await import('./crypto.js');
    expect(maskPhone('+919876543210')).toBe('+91 98765 *****');
  });

  it('masks email keeping first 2 chars of local part', async () => {
    const { maskEmail } = await import('./crypto.js');
    expect(maskEmail('rider@example.com')).toBe('ri***@example.com');
  });
});
