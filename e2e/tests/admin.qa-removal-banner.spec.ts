import { test, expect, request } from '@playwright/test';

// L1-16 — Admin removal reason → dealer-visible banner end-to-end.
//
// What the API tests confirmed: admin can DELETE a listing with a reason
// and the dealer-side GET /dealer/listings returns adminFeedback on that
// row. What this spec adds: the dealer actually sees the orange
// "N listing(s) removed by admin" banner above the tabs, with the exact
// reason text visible.
//
// We drive admin actions via API (faster + avoids brittle UI clicks on
// the admin drawer) and then render the dealer SPA to verify the banner.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
const DEALER_BASE = process.env.DEALER_BASE_URL ?? 'http://localhost:5181/dealer/';
const REASON = `QA E2E removal — ${Date.now()}`;

test('L1-16 · dealer sees admin removal banner with the exact reason text', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await request.newContext();

  // 1. Admin login.
  const adminLogin = await api.post(`${API_BASE}/auth/admin/login`, {
    data: { email: 'admin@hd-cpo.local', password: 'Admin@123!' },
  });
  expect(adminLogin.ok(), 'admin login').toBeTruthy();
  const adminToken = (await adminLogin.json()).accessToken;
  const adminAuth = { Authorization: `Bearer ${adminToken}` };

  // 2. Find an ACTIVE listing owned by gurgaon-hd to remove. The admin
  // listings endpoint returns a bare array; rows expose `dealerName`
  // (not a slug), so we match by the canonical dealer name.
  const listResp = await api.get(`${API_BASE}/admin/listings?status=ACTIVE`, {
    headers: adminAuth,
  });
  expect(listResp.ok(), 'admin listings (ACTIVE)').toBeTruthy();
  const rows = (await listResp.json()) as Array<{
    id: string;
    vin: string;
    dealerName: string;
  }>;
  const target = rows.find((l) => /gurgaon/i.test(l.dealerName));
  test.skip(!target, 'no ACTIVE listing owned by gurgaon-hd to remove');

  // 3. Remove with reason — endpoint is POST /:id/remove (not DELETE).
  const removeResp = await api.post(
    `${API_BASE}/admin/listings/${target.id}/remove`,
    {
      headers: adminAuth,
      data: { reason: REASON },
    },
  );
  expect(removeResp.ok(), 'admin remove with reason').toBeTruthy();

  // 4. Dealer SPA — login, then assert banner.
  await page.goto(DEALER_BASE + 'login');
  await page.getByPlaceholder(/vikram@capital-hd/i).fill('gurgaon-hd');
  await page.locator('input[type="password"]').fill('Dealer@123!');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 });

  await page.goto(DEALER_BASE + 'listings');
  // Banner heading — "N listing(s) removed by admin"
  const bannerHeading = page.getByText(/removed by admin/i).first();
  await expect(bannerHeading, 'removed-by-admin banner visible').toBeVisible({
    timeout: 10_000,
  });

  // The unique reason text must appear inside the banner card.
  await expect(page.getByText(REASON, { exact: false }).first()).toBeVisible();

  // The VIN of the removed listing should also be in the banner.
  await expect(page.locator(`text=${target.vin}`).first()).toBeVisible();
});
