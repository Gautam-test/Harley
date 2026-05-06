import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { getEnv } from '../config/env.js';

// PRD §9.3 — PII (phone, email) encrypted at rest. AES-256-GCM with a per-record
// random IV stored alongside the ciphertext. Key is derived from PII_ENCRYPTION_KEY
// via SHA-256 to allow human-readable secrets in env files.

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = createHash('sha256').update(getEnv().PII_ENCRYPTION_KEY).digest();
  return cachedKey;
}

export function encryptPii(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: v1:base64(iv).base64(tag).base64(ciphertext)
  return `v1:${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

export function decryptPii(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 2 || parts[0] !== 'v1') throw new Error('Invalid PII payload');
  const body = parts[1];
  if (!body) throw new Error('Invalid PII payload');
  const [ivB64, tagB64, ctB64] = body.split('.');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Invalid PII payload');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskPhone(plain: string): string {
  // +91 90123 ***** — keep country code + first 5 digits.
  const digits = plain.replace(/\D/g, '');
  if (digits.length < 7) return '*****';
  return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} *****`;
}

export function maskEmail(plain: string): string {
  const [local, domain] = plain.split('@');
  if (!domain || !local) return '*****';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}
