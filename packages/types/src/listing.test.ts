import { describe, expect, it } from 'vitest';
import { vin, listingSearchQuery, certStatus, createListingInput } from './listing.js';

describe('VIN schema', () => {
  it('accepts a valid 17-char VIN', () => {
    expect(vin.safeParse('1HD1KHM18MB678901').success).toBe(true);
  });

  it.each(['I', 'O', 'Q'])('rejects VINs containing %s', (forbidden) => {
    expect(vin.safeParse(`1HD1KHM18MB67890${forbidden}`).success).toBe(false);
  });

  it('rejects wrong-length VINs', () => {
    expect(vin.safeParse('1HD1KHM18MB67890').success).toBe(false); // 16
    expect(vin.safeParse('1HD1KHM18MB6789012').success).toBe(false); // 18
  });

  it('rejects lowercase characters', () => {
    expect(vin.safeParse('1hd1khm18mb678901').success).toBe(false);
  });
});

describe('listingSearchQuery', () => {
  it('coerces string numbers from the URL', () => {
    const parsed = listingSearchQuery.parse({ minYear: '2020', maxPrice: '500000' });
    expect(parsed.minYear).toBe(2020);
    expect(parsed.maxPrice).toBe(500000);
    expect(parsed.sort).toBe('newest');
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(12);
  });

  it('rejects invalid pincode', () => {
    expect(() => listingSearchQuery.parse({ pincode: '1234' })).toThrow();
  });
});

describe('certStatus', () => {
  it('limits to CPO and AS_IS', () => {
    expect(certStatus.safeParse('CPO').success).toBe(true);
    expect(certStatus.safeParse('AS_IS').success).toBe(true);
    expect(certStatus.safeParse('OTHER').success).toBe(false);
  });
});

describe('createListingInput', () => {
  // Vehicle facts (modelFamily, modelName, year, colour) are derived
  // server-side from Torque against the VIN — they are NOT part of the
  // client-facing create input. The dealer wizard only sends commercial +
  // listing-quality fields.
  // The wizard enforces a 5-photo minimum (PRD §6.2.3 AC3) so the schema's
  // images.min(5) bound is part of the contract — a single placeholder URL
  // would never make it past the form.
  const fivePlaceholderImages = [
    'https://placehold.co/600x450?img=1',
    'https://placehold.co/600x450?img=2',
    'https://placehold.co/600x450?img=3',
    'https://placehold.co/600x450?img=4',
    'https://placehold.co/600x450?img=5',
  ];

  it('accepts a complete payload', () => {
    expect(
      createListingInput.safeParse({
        vin: '1HD1KHM18MB678901',
        price: 2895000,
        kmsDriven: 8400,
        owners: 1,
        description: 'Lorem ipsum dolor sit amet consectetur',
        images: fivePlaceholderImages,
        inspectionReportUrl: null,
        certificationStatus: 'CPO',
      }).success,
    ).toBe(true);
  });

  it('rejects too-short descriptions', () => {
    const r = createListingInput.safeParse({
      vin: '1HD1KHM18MB678901',
      price: 1000000,
      kmsDriven: 1000,
      owners: 1,
      description: 'too short',
      images: fivePlaceholderImages,
      inspectionReportUrl: null,
      certificationStatus: 'AS_IS',
    });
    expect(r.success).toBe(false);
  });

  // Bug 1 regression guard — AS-IS submissions send `cpoDocs: null` because
  // there's no certification doc set. The schema must accept that explicit
  // null without throwing the "Expected object, received null" the dealer
  // wizard hit before the .nullable() shim landed.
  it('accepts cpoDocs: null on AS_IS payloads', () => {
    const r = createListingInput.safeParse({
      vin: '1HD1KHM18MB678901',
      price: 950000,
      kmsDriven: 12000,
      owners: 2,
      description: 'As-is bike sold without H-D Certified inspection documents.',
      images: fivePlaceholderImages,
      inspectionReportUrl: null,
      certificationStatus: 'AS_IS',
      cpoDocs: null,
    });
    expect(r.success).toBe(true);
  });
});
