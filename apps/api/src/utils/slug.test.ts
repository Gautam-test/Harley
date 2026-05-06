import { describe, expect, it } from 'vitest';
import { buildListingSlug } from './slug.js';

describe('buildListingSlug', () => {
  it('lowercases, hyphenates the model, and appends VIN tail', () => {
    expect(buildListingSlug(2023, 'Street Glide Special', '1HD1KHM18MB678901')).toBe(
      '2023-street-glide-special-678901',
    );
  });

  it('strips punctuation', () => {
    expect(buildListingSlug(2024, 'Pan America 1250 Special!', '1HD1AAA22BB123456')).toBe(
      '2024-pan-america-1250-special-123456',
    );
  });

  it('collapses repeated whitespace and hyphens', () => {
    expect(buildListingSlug(2022, 'Fat   Boy   114', '1HD1FFF11CC987654')).toBe(
      '2022-fat-boy-114-987654',
    );
  });

  it('uses lowercase VIN tail', () => {
    const slug = buildListingSlug(2024, 'X 350', '1HD1XXX99ZZ7654AB');
    expect(slug.endsWith('7654ab')).toBe(true);
  });
});
