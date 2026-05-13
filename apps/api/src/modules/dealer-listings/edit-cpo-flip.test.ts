/**
 * Regression test for ticket #3: "When editing the selling price or
 * description in Step 2, and in Step 3 changing the status from CPO
 * Certified to As-Is or vice versa, then clicking Submit for Approval,
 * the updated data is not reflected on the dealer side and admin side."
 *
 * Root cause for the AS_IS flip: the previous shim in updateListing
 * mapped a frontend-sent `cpoDocs: null` to `cpoDocs: undefined`, which
 * Prisma treats as "no update". So the column kept the old CPO kit
 * object even after the cert flipped to AS_IS — the admin would see
 * an AS_IS bike still carrying CPO docs, and re-opening the wizard
 * showed inconsistent state.
 *
 * After the fix, null maps to Prisma.DbNull so the column actually
 * clears. undefined still means "no change" and a passed-in object
 * still writes verbatim.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
  process.env.REDIS_URL = 'mock://';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
  process.env.OTP_VERIFIED_TOKEN_SECRET = 'c'.repeat(32);
  process.env.PII_ENCRYPTION_KEY = 'test-pii-encryption-key-1234567890';
});

const findUnique = vi.fn();
const update = vi.fn();

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    listing: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

const ROOT_VIN = '1HD1KHM18MB678901';
const baseListing = {
  id: 'listing-1',
  dealerId: 'dealer-1',
  vin: ROOT_VIN,
  status: 'ACTIVE',
};

describe('updateListing — cpoDocs handling on cert flip', () => {
  it('CPO → AS_IS: cpoDocs null clears the column via Prisma.DbNull', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce(baseListing);
    update.mockResolvedValueOnce({ id: 'listing-1', status: 'ACTIVE' });

    await updateListing('dealer-1', 'listing-1', {
      price: 1500000,
      description: 'Updated description for the AS-IS conversion',
      certificationStatus: 'AS_IS',
      inspectionReportUrl: null,
      cpoDocs: null, // dealer flipped CPO → AS_IS
    });

    const writeArgs = update.mock.calls[0]![0] as { data: Record<string, unknown> };
    // The Prisma DbNull sentinel ensures the JSON column is cleared, not
    // skipped. Without the fix, this used to be undefined which Prisma
    // interpreted as "leave the existing CPO kit object in place".
    const { Prisma } = await import('@prisma/client');
    expect(writeArgs.data.cpoDocs).toBe(Prisma.DbNull);
    // certificationStatus + inspectionReportUrl should also be applied.
    expect(writeArgs.data.certificationStatus).toBe('AS_IS');
    expect(writeArgs.data.inspectionReportUrl).toBeNull();
  });

  it('AS_IS → CPO: cpoDocs object writes verbatim', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce({ ...baseListing, status: 'ACTIVE' });
    update.mockResolvedValueOnce({ id: 'listing-1', status: 'ACTIVE' });

    const docs = { kitVersion: 'v3', engine: 'doc.pdf', frame: 'frame.pdf' };
    await updateListing('dealer-1', 'listing-1', {
      price: 1500000,
      certificationStatus: 'CPO',
      inspectionReportUrl: 'https://example.com/inspection.pdf',
      cpoDocs: docs,
    });

    const writeArgs = update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(writeArgs.data.cpoDocs).toEqual(docs);
    expect(writeArgs.data.certificationStatus).toBe('CPO');
    expect(writeArgs.data.inspectionReportUrl).toBe('https://example.com/inspection.pdf');
  });

  it('cpoDocs omitted from PATCH (undefined): no change, key absent from data', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce(baseListing);
    update.mockResolvedValueOnce({ id: 'listing-1', status: 'ACTIVE' });

    await updateListing('dealer-1', 'listing-1', {
      price: 1500000,
      // cpoDocs intentionally not in the payload
    });

    const writeArgs = update.mock.calls[0]![0] as { data: Record<string, unknown> };
    // When cpoDocs is undefined (not sent), the spread should NOT add a
    // cpoDocs key at all — Prisma's "absent key = no update" semantics.
    expect('cpoDocs' in writeArgs.data).toBe(false);
    expect(writeArgs.data.price).toBe(1500000);
  });

  it('always clears adminFeedback on edit (existing behaviour)', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce(baseListing);
    update.mockResolvedValueOnce({ id: 'listing-1', status: 'ACTIVE' });

    await updateListing('dealer-1', 'listing-1', { price: 1234567 });
    const writeArgs = update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(writeArgs.data.adminFeedback).toBeNull();
  });

  it('price + description + cert flip all land together in a single PATCH', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce(baseListing);
    update.mockResolvedValueOnce({ id: 'listing-1', status: 'ACTIVE' });

    await updateListing('dealer-1', 'listing-1', {
      price: 1999999,
      description: 'Lightly used, original CPO kit attached',
      kmsDriven: 5500,
      certificationStatus: 'AS_IS',
      inspectionReportUrl: null,
      cpoDocs: null,
    });

    const writeArgs = update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(writeArgs.data.price).toBe(1999999);
    expect(writeArgs.data.description).toBe('Lightly used, original CPO kit attached');
    expect(writeArgs.data.kmsDriven).toBe(5500);
    expect(writeArgs.data.certificationStatus).toBe('AS_IS');
    // Single PATCH writes every field — no "second submit" needed.
    expect(update).toHaveBeenCalledOnce();
  });
});
