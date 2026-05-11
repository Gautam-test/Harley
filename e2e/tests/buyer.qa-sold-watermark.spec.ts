import { test, expect, request } from '@playwright/test';

// L1-05 — SOLD watermark visual rendering.
//
// The data path (mark-sold → search drops row after 1h → detail 404s) is
// covered by the API-level checks. What that does NOT verify is the actual
// rendered overlay on the buyer detail page: a diagonal "Sold" banner
// with the `bg-danger` class, plus `grayscale-[35%]` on the hero <img>.
//
// Strategy: drive the dealer API to mark a fresh ACTIVE listing SOLD,
// then load the buyer DETAIL page (/listings/<slug>) and assert the
// visual treatment on its hero gallery. We use the detail page rather
// than /search because /search paginates (default page size = 12) and a
// just-sold row can land off page 1 depending on publishedAt ordering;
// the detail URL is deterministic.
//
// Marking SOLD is one-way (no un-sell endpoint), so this consumes one
// seeded listing per run. With 50 seeded ACTIVEs this is fine; the spec
// gracefully skips if nothing ACTIVE is available.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
const BUYER_BASE = process.env.BUYER_BASE_URL ?? 'http://localhost:5180/';

test('L1-05 · SOLD card renders diagonal banner + grayscale image', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await request.newContext();

  // 1. Dealer login → token
  const loginResp = await api.post(`${API_BASE}/auth/dealer/login`, {
    data: { username: 'gurgaon-hd', password: 'Dealer@123!' },
  });
  expect(loginResp.ok(), 'dealer login').toBeTruthy();
  const { accessToken } = await loginResp.json();
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 2. Find an ACTIVE listing owned by this dealer. The dealer-listings
  // endpoint returns a bare array, not a {results} envelope.
  const listResp = await api.get(`${API_BASE}/dealer/listings`, { headers: auth });
  expect(listResp.ok(), 'dealer listings').toBeTruthy();
  const rows = (await listResp.json()) as Array<{
    id: string;
    vin: string;
    slug: string;
    status: string;
  }>;
  const active = rows.find((l) => l.status === 'ACTIVE');
  test.skip(!active, 'no ACTIVE listing owned by gurgaon-hd to mark sold');

  // 3. Mark it sold
  const markResp = await api.post(
    `${API_BASE}/dealer/listings/${active.id}/mark-sold`,
    { headers: auth },
  );
  expect(markResp.ok(), 'mark-sold').toBeTruthy();

  // 4. Hit the detail page directly via slug — deterministic URL.
  await page.goto(`${BUYER_BASE}listings/${active.slug}`);

  // 5. Diagonal SOLD banner from ImageGallery — the <span> uses bg-danger,
  //    -rotate-12, and renders the literal text "Sold" (uppercased by CSS).
  //    Scope to spans that carry the bg-danger Tailwind class so we don't
  //    accidentally match a future copy block that happens to contain the
  //    word.
  const banner = page.locator('span[class*="bg-danger"]').first();
  await expect(banner, 'SOLD overlay span visible on detail page').toBeVisible({
    timeout: 10_000,
  });
  await expect(banner).toHaveText(/sold/i);
  const bannerStyle = await banner.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, transform: cs.transform };
  });
  // bg-danger/90 → non-transparent red — assert reddish (R > G, R > B).
  expect(bannerStyle.bg).not.toBe('rgba(0, 0, 0, 0)');
  const rgbMatch = bannerStyle.bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  expect(rgbMatch, `banner background parses as rgb(): ${bannerStyle.bg}`).not.toBeNull();
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch.map(Number);
    expect(r, `red > green (${r} > ${g})`).toBeGreaterThan(g!);
    expect(r, `red > blue (${r} > ${b})`).toBeGreaterThan(b!);
  }
  // -rotate-12 produces a non-identity transform.
  expect(bannerStyle.transform).not.toBe('none');

  // 6. Hero image gets a grayscale filter when SOLD.
  const heroImg = page.locator('main img, [class*="gallery"] img').first();
  await expect(heroImg).toBeVisible();
  const filter = await heroImg.evaluate((el) => getComputedStyle(el).filter);
  expect(filter, `hero image carries grayscale filter (got: ${filter})`).toContain(
    'grayscale',
  );
});
