/**
 * Unit tests for the pincode → coord lookup.
 *
 * Behaviour after the May-13 simplification: pincodeCoord returns the
 * coordinate for an exact 3-digit prefix match, or null for anything
 * else (unmapped prefix, malformed input, invalid digits). The earlier
 * 1-digit regional fallback was removed because it surfaced bikes from
 * the wrong city ("approximate" results felt like the filter was
 * misbehaving). The route handler now treats null the same as "no
 * dealers in range" → empty results + the buyer-side empty-state
 * message.
 */
import { describe, it, expect } from 'vitest';
import { pincodeCoord, distanceKm } from './pincode-coords.js';

describe('pincodeCoord — exact 3-digit prefix match', () => {
  it('resolves a known prefix to the exact city centroid', () => {
    const c = pincodeCoord('122001'); // Gurgaon
    expect(c).toEqual({ lat: 28.4595, lng: 77.0266, city: 'Gurgaon' });
  });

  it('resolves Mumbai 400xxx exactly', () => {
    expect(pincodeCoord('400050')?.city).toBe('Mumbai');
  });

  it('resolves Bengaluru 560xxx exactly', () => {
    expect(pincodeCoord('560025')?.city).toBe('Bengaluru');
  });

  it('resolves Chennai 600xxx exactly', () => {
    expect(pincodeCoord('600002')?.city).toBe('Chennai');
  });
});

describe('pincodeCoord — returns null when prefix is not in the curated table', () => {
  it('returns null for unmapped East-region pincode (799xxx Tripura)', () => {
    expect(pincodeCoord('799001')).toBeNull();
  });

  it('returns null for unmapped South pincode (515xxx)', () => {
    expect(pincodeCoord('515001')).toBeNull();
  });

  it('returns null for any pincode whose 3-digit prefix is unmapped', () => {
    // Sample one from each region that we deliberately don't curate.
    const samples = ['175001', '281001', '533001', '670001', '735101', '835001', '900001'];
    for (const pin of samples) {
      expect(pincodeCoord(pin)).toBeNull();
    }
  });
});

describe('pincodeCoord — null on malformed input', () => {
  it('returns null for too-short pincodes', () => {
    expect(pincodeCoord('12')).toBeNull();
  });

  it('returns null for non-digit pincodes', () => {
    expect(pincodeCoord('abcdef')).toBeNull();
  });

  it('returns null for pincodes with letters mixed in', () => {
    expect(pincodeCoord('12a456')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(pincodeCoord('')).toBeNull();
  });

  it('returns null for 000000 — Indian PINs never start with 0', () => {
    expect(pincodeCoord('000000')).toBeNull();
  });

  it('returns null for any pincode starting with 0', () => {
    expect(pincodeCoord('012345')).toBeNull();
    expect(pincodeCoord('099999')).toBeNull();
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
