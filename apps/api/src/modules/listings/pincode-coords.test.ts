/**
 * Unit tests for the pincode → coord lookup. Built when the regional
 * fallback was added so unmapped pincodes resolve to *something* and the
 * buyer's distance filter actually runs (instead of silently no-op'ing
 * and looking like the search filter is broken).
 */
import { describe, it, expect } from 'vitest';
import { pincodeCoord, distanceKm } from './pincode-coords.js';

describe('pincodeCoord — exact 3-digit prefix match', () => {
  it('resolves a known prefix to the exact city centroid', () => {
    const r = pincodeCoord('122001'); // Gurgaon
    expect(r.match).toBe('exact');
    expect(r.coord).toEqual({ lat: 28.4595, lng: 77.0266, city: 'Gurgaon' });
  });

  it('resolves Mumbai 400xxx exactly', () => {
    const r = pincodeCoord('400050');
    expect(r.match).toBe('exact');
    expect(r.coord?.city).toBe('Mumbai');
  });
});

describe('pincodeCoord — 1-digit region fallback', () => {
  it('falls back to Kolkata for an unmapped East-region pincode (799xxx Tripura)', () => {
    const r = pincodeCoord('799001');
    expect(r.match).toBe('region');
    expect(r.coord?.city).toBe('Kolkata');
  });

  it('falls back to Hyderabad for an unmapped South-AP/KA pincode (515xxx)', () => {
    const r = pincodeCoord('515001');
    expect(r.match).toBe('region');
    expect(r.coord?.city).toBe('Hyderabad');
  });

  it('region fallback returns a non-null coord for every digit 1-9', () => {
    for (let d = 1; d <= 9; d++) {
      // Pad so the 3-digit prefix is intentionally outside PREFIX_MAP
      // (e.g. 199xxx, 299xxx, …) — every region centroid must resolve.
      const pin = `${d}99000`;
      const r = pincodeCoord(pin);
      expect(r.coord).not.toBeNull();
      // Either match — depends on whether the d99 prefix happens to be
      // mapped. The contract is "every well-formed pincode resolves".
      expect(['exact', 'region']).toContain(r.match);
    }
  });
});

describe('pincodeCoord — invalid input', () => {
  it('returns invalid for too-short pincodes', () => {
    expect(pincodeCoord('12')).toEqual({ coord: null, match: 'invalid' });
  });

  it('returns invalid for non-digit pincodes', () => {
    expect(pincodeCoord('abcdef')).toEqual({ coord: null, match: 'invalid' });
  });

  it('returns invalid for pincodes with letters mixed in', () => {
    expect(pincodeCoord('12a456')).toEqual({ coord: null, match: 'invalid' });
  });

  it('returns invalid for empty string', () => {
    expect(pincodeCoord('')).toEqual({ coord: null, match: 'invalid' });
  });

  it('returns invalid for 000000 — Indian PINs never start with 0', () => {
    expect(pincodeCoord('000000')).toEqual({ coord: null, match: 'invalid' });
  });

  it('returns invalid for any pincode starting with 0', () => {
    // Region 0 doesn't exist in India's postal system; we have entries
    // for digits 1-9 only. A '0' prefix should never resolve.
    expect(pincodeCoord('012345').match).toBe('invalid');
    expect(pincodeCoord('099999').match).toBe('invalid');
  });
});

describe('distanceKm — sanity', () => {
  it('returns 0 for identical points', () => {
    expect(distanceKm({ lat: 28, lng: 77 }, { lat: 28, lng: 77 })).toBe(0);
  });

  it('returns Delhi → Mumbai distance ≈ 1150 km (within 5%)', () => {
    const d = distanceKm(
      { lat: 28.6139, lng: 77.209 },
      { lat: 19.076, lng: 72.8777 },
    );
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1200);
  });
});
