import { test, expect, request } from '@playwright/test';

// L1-05 — SOLD listings are fully blocked from the buyer detail page.
//
// Updated requirement (2026-05-11): the 1-hour visibility grace on the
// detail page has been removed. SOLD bikes 404 the moment the dealer
// marks them. The search grid still surfaces the SOLD card with a
// watermark for the 1-hour window so a returning buyer sees what
// happened — but the card is NOT wrapped in an <a>, and clicking it
// pops a "This bike is sold" modal explaining the state instead of
// navigating anywhere. Past the window, the row drops off the grid.
//
// Coverage in this spec:
//   • Detail URL → 404 NotFound copy, immediately, within the same
//     1-hour window where the card still renders on /search.
//   • Card on /search renders the SOLD overlay (bg-danger span +
//     grayscale image) but is NOT wrapped in an <a>.
//   • Clicking the SOLD card opens a "This Bike Is Sold" dialog with
//     OK + Browse Stock buttons; the URL does not change.
//
// Marking SOLD is one-way (no un-sell endpoint), so this consumes one
// seeded listing per run. The spec gracefully skips if no ACTIVE
// listing is available.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
const BUYER_BASE = process.env.BUYER_BASE_URL ?? 'http://localhost:5180/';

test('L1-05 · SOLD listing — detail 404s + card inert with watermark', async ({ page }) => {
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

  // 3. Mark it sold.
  const markResp = await api.post(
    `${API_BASE}/dealer/listings/${active.id}/mark-sold`,
    { headers: auth },
  );
  expect(markResp.ok(), 'mark-sold').toBeTruthy();

  // 4a. Detail URL — must 404 immediately (no 1-hour grace any more).
  //     The SPA renders a NotFound block whose heading reads "Listing Not
  //     Available"; the underlying API call returns HTTP 404.
  const detailApi = await api.get(`${API_BASE}/listings/${active.slug}`);
  expect(detailApi.status(), 'detail API returns 404 for SOLD').toBe(404);

  await page.goto(`${BUYER_BASE}listings/${active.slug}`);
  await expect(
    page.getByRole('heading', { name: /listing not available/i }),
    'NotFound heading rendered',
  ).toBeVisible({ timeout: 10_000 });
  // The interactive sidebar (Visit Dealer, EMI calculator) must NOT
  // render on the NotFound path.
  await expect(page.getByRole('button', { name: /visit dealer/i })).toHaveCount(0);

  // 4b. Search grid — within the 1-hour visibility window the row still
  //     appears with a SOLD watermark, but the card is inert (no <a>).
  await page.goto(`${BUYER_BASE}search`);
  // Find the watermark span carrying bg-danger.
  const banner = page.locator('span[class*="bg-danger"]').first();
  await expect(banner, 'SOLD overlay span renders on at least one card').toBeVisible({
    timeout: 10_000,
  });
  await expect(banner).toHaveText(/sold/i);

  // Banner: reddish background + non-identity transform (-rotate-12).
  const bannerStyle = await banner.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, transform: cs.transform };
  });
  const rgbMatch = bannerStyle.bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  expect(rgbMatch, `banner bg parses as rgb(): ${bannerStyle.bg}`).not.toBeNull();
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch.map(Number);
    expect(r, `red > green (${r} > ${g})`).toBeGreaterThan(g!);
    expect(r, `red > blue (${r} > ${b})`).toBeGreaterThan(b!);
  }
  expect(bannerStyle.transform).not.toBe('none');

  // The card containing the watermark must NOT be an <a> and must not
  // have an href into /listings/<slug>. Walk up from the banner and
  // assert no ancestor anchor.
  const isInsideAnchor = await banner.evaluate((el) => {
    let p: HTMLElement | null = el.parentElement;
    while (p) {
      if (p.tagName === 'A') return true;
      p = p.parentElement;
    }
    return false;
  });
  expect(isInsideAnchor, 'SOLD card is NOT wrapped in an <a>').toBe(false);

  // Image carries grayscale filter.
  const cardImg = banner.locator('xpath=ancestor::*[contains(@class,"rounded-card")]').locator('img').first();
  const filter = await cardImg.evaluate((el) => getComputedStyle(el).filter);
  expect(filter, `card image carries grayscale (got: ${filter})`).toContain('grayscale');

  // Clicking the SOLD card surfaces an explanation modal instead of
  // navigating anywhere. Locate the SOLD card's clickable wrapper (the
  // <button> rendered when status === 'SOLD') and click it.
  const soldCard = banner.locator(
    'xpath=ancestor::button[@aria-haspopup="dialog"][1]',
  );
  await expect(soldCard, 'SOLD card is a clickable button').toBeVisible();
  const urlBefore = page.url();
  await soldCard.click();

  const soldDialog = page.getByRole('dialog', { name: /this bike is sold/i });
  await expect(soldDialog, '"This Bike Is Sold" dialog visible').toBeVisible({
    timeout: 5_000,
  });
  await expect(soldDialog).toContainText(/no longer available/i);
  await expect(soldDialog.getByRole('button', { name: /^ok$/i })).toBeVisible();
  await expect(soldDialog.getByRole('link', { name: /browse stock/i })).toBeVisible();
  // URL must NOT have changed — no navigation occurred.
  expect(page.url(), 'URL unchanged after SOLD-card click').toBe(urlBefore);
});
