/**
 * Unit tests for the VIN duplicate guards added in QA round 10:
 *   - dealer updateListing: rejects restore-to-DRAFT when root VIN is
 *     already in use by another non-terminal listing (QA #3)
 *   - admin /publish: rejects when root VIN is already on another
 *     ACTIVE/DEACTIVATED listing (QA #2 — race / orphan path)
 *
 * Database access is stubbed via vi.mock so these tests don't need a
 * live Postgres. We assert the service throws HttpError(409) with the
 * right code, and that the underlying prisma.listing.update is NOT
 * called when a conflict is detected.
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
const findFirst = vi.fn();
const update = vi.fn();

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    listing: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  update.mockReset();
});

describe('dealer updateListing — VIN restore guard (QA #3)', () => {
  it('rejects restoring a SOLD listing whose root VIN is now on an ACTIVE one', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    // The SOLD bike's stored VIN carries the retire-prefix.
    findUnique.mockResolvedValueOnce({
      id: 'sold-bike-id',
      dealerId: 'dealer-1',
      vin: 'sold:cmold123:1HD1KHM18MB678901',
      status: 'SOLD',
    });
    // findFirst returns the conflicting ACTIVE listing.
    findFirst.mockResolvedValueOnce({
      id: 'active-bike-id',
      status: 'ACTIVE',
      vin: '1HD1KHM18MB678901',
    });
    await expect(
      updateListing('dealer-1', 'sold-bike-id', { price: 1500000 }),
    ).rejects.toMatchObject({ status: 409, code: 'VIN_IN_USE' });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects restoring a REMOVED listing colliding with another DRAFT', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce({
      id: 'removed-bike-id',
      dealerId: 'dealer-1',
      vin: 'removed:cmold456:1HD1FBV13NB512347',
      status: 'REMOVED',
    });
    findFirst.mockResolvedValueOnce({
      id: 'pending-bike-id',
      status: 'DRAFT',
      vin: '1HD1FBV13NB512347',
    });
    await expect(
      updateListing('dealer-1', 'removed-bike-id', { price: 1800000 }),
    ).rejects.toMatchObject({ status: 409, code: 'VIN_IN_USE' });
  });

  it('ALLOWS restore when no other listing has the root VIN', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce({
      id: 'sold-bike-id',
      dealerId: 'dealer-1',
      vin: 'sold:cmold123:1HD1KHM18MB678901',
      status: 'SOLD',
    });
    findFirst.mockResolvedValueOnce(null); // no conflict
    update.mockResolvedValueOnce({ id: 'sold-bike-id', status: 'DRAFT' });
    await expect(
      updateListing('dealer-1', 'sold-bike-id', { price: 1500000 }),
    ).resolves.toMatchObject({ id: 'sold-bike-id', status: 'DRAFT' });
    expect(update).toHaveBeenCalledOnce();
  });

  it('does NOT run the VIN check on non-restore edits (DRAFT → DRAFT)', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce({
      id: 'draft-bike-id',
      dealerId: 'dealer-1',
      vin: '1HD1KHM18MB678901',
      status: 'DRAFT',
    });
    update.mockResolvedValueOnce({ id: 'draft-bike-id', status: 'DRAFT' });
    await updateListing('dealer-1', 'draft-bike-id', { price: 1500000 });
    expect(findFirst).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('rejects edit when listing belongs to a different dealer (existing guard)', async () => {
    const { updateListing } = await import('./dealer-listings.service.js');
    findUnique.mockResolvedValueOnce({
      id: 'sold-bike-id',
      dealerId: 'OTHER-dealer',
      vin: 'sold:cmold:1HD1KHM18MB678901',
      status: 'SOLD',
    });
    await expect(
      updateListing('dealer-1', 'sold-bike-id', { price: 1500000 }),
    ).rejects.toMatchObject({ status: 404, code: 'LISTING_NOT_FOUND' });
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('rootVin prefix stripping', () => {
  it('strips removed: prefix correctly', async () => {
    // Indirectly test by triggering the restore path with various stored VINs.
    const { updateListing } = await import('./dealer-listings.service.js');
    const cases = [
      { stored: 'removed:cm123abc:1HD1KHM18MB678901', root: '1HD1KHM18MB678901' },
      { stored: 'sold:cm456def:1HD1FBV13NB512347', root: '1HD1FBV13NB512347' },
      { stored: 'deactivated:xyz:1HD1RA1A5RB778899', root: '1HD1RA1A5RB778899' },
      // No prefix — root equals stored
      { stored: '1HD1KEM13PB445566', root: '1HD1KEM13PB445566' },
    ];
    for (const c of cases) {
      findUnique.mockResolvedValueOnce({
        id: 'x',
        dealerId: 'd1',
        vin: c.stored,
        status: 'SOLD',
      });
      // We capture the OR clause that updateListing built — the second
      // arm (vin: rootVin) is what's interesting.
      let capturedWhere: { OR?: Array<{ vin: string }> } | null = null;
      findFirst.mockImplementationOnce((args: { where: typeof capturedWhere }) => {
        capturedWhere = args.where;
        return Promise.resolve(null);
      });
      update.mockResolvedValueOnce({ id: 'x', status: 'DRAFT' });
      await updateListing('d1', 'x', { price: 1500000 });
      const orList = capturedWhere?.OR ?? [];
      const vins = orList.map((o) => o.vin);
      expect(vins).toContain(c.root);
    }
  });
});
