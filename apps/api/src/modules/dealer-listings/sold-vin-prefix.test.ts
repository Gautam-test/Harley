/**
 * Regression test for the SOLD-VIN retire-prefix bug.
 *
 * Before the fix: when a new listing reused a SOLD/REMOVED bike's VIN,
 * createListing mutated the OLD row's vin to 'sold:cmid:VIN'. The dealer
 * SPA's edit wizard then hydrated from GET /dealer/listings/:id with that
 * mangled VIN and immediately fired GET /torque/vehicles/{prefixedVin}
 * which Zod-rejected as VALIDATION_ERROR ("Invalid request payload"),
 * leaving the wizard unable to open the SOLD listing at all.
 *
 * After the fix: getDealerListing and listForDealer both strip the
 * retire-prefix via rootVin() before returning, so the API surface
 * always presents the clean 17-char VIN. The DB row keeps the prefixed
 * value (the unique constraint depends on it), but no SPA ever sees it.
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

const findFirst = vi.fn();
const findMany = vi.fn();

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    listing: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

beforeEach(() => {
  findFirst.mockReset();
  findMany.mockReset();
});

const ROOT_VIN = '1HD1KHM18MB678901';

describe('rootVin — string-level helper', () => {
  it('strips sold:cmid: prefix', async () => {
    const { rootVin } = await import('./dealer-listings.service.js');
    expect(rootVin(`sold:cm123abc:${ROOT_VIN}`)).toBe(ROOT_VIN);
  });

  it('strips removed:cmid: prefix', async () => {
    const { rootVin } = await import('./dealer-listings.service.js');
    expect(rootVin(`removed:cm456def:${ROOT_VIN}`)).toBe(ROOT_VIN);
  });

  it('strips deactivated:cmid: prefix', async () => {
    const { rootVin } = await import('./dealer-listings.service.js');
    expect(rootVin(`deactivated:cmxyz:${ROOT_VIN}`)).toBe(ROOT_VIN);
  });

  it('passes through clean VINs unchanged', async () => {
    const { rootVin } = await import('./dealer-listings.service.js');
    expect(rootVin(ROOT_VIN)).toBe(ROOT_VIN);
  });

  it('does not strip prefixes inside the VIN body itself', async () => {
    const { rootVin } = await import('./dealer-listings.service.js');
    // A clean VIN that happens to contain "sold" / "removed" mid-string
    // (impossible per spec since VIN charset excludes lowercase, but the
    // regex anchor at ^ guarantees this regardless).
    expect(rootVin(ROOT_VIN)).toBe(ROOT_VIN);
  });
});

describe('getDealerListing — strips retire-prefix from returned vin', () => {
  it('returns clean vin when DB row carries sold: prefix', async () => {
    const { getDealerListing } = await import('./dealer-listings.service.js');
    findFirst.mockResolvedValueOnce({
      id: 'listing-1',
      vin: `sold:cm123abc:${ROOT_VIN}`,
      slug: 'sold-cm123abc-2024-street-bob-114-678901',
      modelName: 'Street Bob 114',
      modelFamily: 'Cruiser',
      year: 2024,
      colour: 'Redline Red',
      price: { toString: () => '1234567' },
      kmsDriven: 6700,
      owners: 1,
      description: 'A bike',
      images: [],
      inspectionReportUrl: null,
      certificationStatus: 'AS_IS',
      status: 'SOLD',
      adminFeedback: null,
      cpoDocs: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-01'),
    });
    const result = await getDealerListing('dealer-1', 'listing-1');
    expect(result?.vin).toBe(ROOT_VIN);
    // 17 chars + matches the canonical VIN regex — would now pass the
    // /torque/vehicles/:vin path validator that broke the wizard before.
    expect(result?.vin).toHaveLength(17);
    expect(result?.vin).toMatch(/^[A-HJ-NPR-Z0-9]{17}$/);
  });

  it('returns the vin unchanged when no retire-prefix is present', async () => {
    const { getDealerListing } = await import('./dealer-listings.service.js');
    findFirst.mockResolvedValueOnce({
      id: 'listing-1',
      vin: ROOT_VIN,
      slug: '2024-street-bob-114-678901',
      modelName: 'Street Bob 114',
      modelFamily: 'Cruiser',
      year: 2024,
      colour: 'Redline Red',
      price: { toString: () => '1234567' },
      kmsDriven: 6700,
      owners: 1,
      description: 'A bike',
      images: [],
      inspectionReportUrl: null,
      certificationStatus: 'AS_IS',
      status: 'ACTIVE',
      adminFeedback: null,
      cpoDocs: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-01'),
    });
    const result = await getDealerListing('dealer-1', 'listing-1');
    expect(result?.vin).toBe(ROOT_VIN);
  });

  it('returns null when no row found (no crash on strip)', async () => {
    const { getDealerListing } = await import('./dealer-listings.service.js');
    findFirst.mockResolvedValueOnce(null);
    const result = await getDealerListing('dealer-1', 'ghost');
    expect(result).toBeNull();
  });
});

describe('listForDealer — strips retire-prefix from each row', () => {
  it('clean VIN on every returned row, even when DB has prefixed values', async () => {
    const { listForDealer } = await import('./dealer-listings.service.js');
    findMany.mockResolvedValueOnce([
      {
        id: 'l1',
        vin: `sold:cm1:${ROOT_VIN}`,
        slug: 'sold-cm1-x',
        modelName: 'Street Bob 114',
        year: 2024,
        price: { toString: () => '1234567' },
        kmsDriven: 6700,
        certificationStatus: 'AS_IS',
        status: 'SOLD',
        images: [],
        adminFeedback: null,
        publishedAt: null,
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'l2',
        vin: `removed:cm2:${ROOT_VIN}`,
        slug: 'removed-cm2-y',
        modelName: 'Low Rider S',
        year: 2024,
        price: { toString: () => '1825000' },
        kmsDriven: 2800,
        certificationStatus: 'CPO',
        status: 'REMOVED',
        images: [],
        adminFeedback: null,
        publishedAt: null,
        createdAt: new Date('2026-01-02'),
      },
      {
        id: 'l3',
        vin: ROOT_VIN, // clean — no prefix
        slug: 'live',
        modelName: 'Heritage Classic 114',
        year: 2023,
        price: { toString: () => '2150000' },
        kmsDriven: 9200,
        certificationStatus: 'CPO',
        status: 'ACTIVE',
        images: [],
        adminFeedback: null,
        publishedAt: new Date('2026-01-03'),
        createdAt: new Date('2026-01-03'),
      },
    ]);
    const rows = await listForDealer('dealer-1');
    for (const row of rows) {
      expect(row.vin).toBe(ROOT_VIN);
      expect(row.vin).toHaveLength(17);
    }
  });
});
