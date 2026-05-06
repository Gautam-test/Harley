import { describe, expect, it } from 'vitest';
import { decodeVinYear } from './vinYear.js';

describe('decodeVinYear', () => {
  // 10th char (zero-indexed: 9) → year. We pick the most recent cycle ≤ now+1.
  // As of 2026, the 2010-cycle dominates: A=2010, ..., M=2021, N=2022, P=2023,
  // R=2024, S=2025, T=2026, V=2027, W=2028, X=2029, Y=2030.
  it('returns the current cycle for an "M" code (2021 in 2010-cycle)', () => {
    expect(decodeVinYear('1HD1KHM18MB770001')).toBe(2021);
  });

  it('returns the current cycle for an "T" code (2026)', () => {
    expect(decodeVinYear('1HD1KB417TB770001')).toBe(2026);
  });

  it('handles the numeric block (1-9 → 2001-2009 / 2031-2039)', () => {
    // 10th char "5" → cycle index 25 → 1980+25 = 2005; the next cycle would
    // be 2035 which is past `now+1` (2027), so we stop at 2005.
    expect(decodeVinYear('1HD1KB4175B770001')).toBe(2005);
  });

  it('throws on a missing or short VIN', () => {
    expect(() => decodeVinYear('SHORT')).toThrow();
    expect(() => decodeVinYear('')).toThrow();
  });

  it('throws on an invalid year code at position 10', () => {
    // "I" is excluded from VIN year codes
    expect(() => decodeVinYear('1HD1KB417IB770001')).toThrow(/Invalid VIN year/);
  });
});
