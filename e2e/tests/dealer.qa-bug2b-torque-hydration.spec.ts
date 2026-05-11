import { test, expect, request, type APIRequestContext } from '@playwright/test';

// Bug 2b — opening a previously-saved listing in the edit wizard now
// re-fetches the VIN through Torque so Step 1's "Fetched from Torque
// DMS" card shows Engine, Customer Name and Date of Invoice. Without
// the fix the dealer-listings row only persists model / family / year /
// colour, so those three values rendered blank.
//
// We exercise three states the dealer can land on the edit wizard from:
//   • DRAFT   — newly created, before admin review
//   • REMOVED — admin or dealer removed it; opened via View / Restore
//   • DEACTIVATED — dealer turned it off
//
// For each, we open /listings/<id>/edit and assert the three Torque
// fields render with non-blank values.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
const DEALER_BASE = process.env.DEALER_BASE_URL ?? 'http://localhost:5181/dealer/';

function uniqueVin(): string {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let mid = '';
  for (let i = 0; i < 7; i++) mid += chars[Math.floor(Math.random() * chars.length)];
  return `1HD3CF${mid}0001`;
}

async function dealerToken(api: APIRequestContext): Promise<string> {
  const r = await api.post(`${API_BASE}/auth/dealer/login`, {
    data: { username: 'gurgaon-hd', password: 'Dealer@123!' },
  });
  if (!r.ok()) throw new Error('dealer login');
  return (await r.json()).accessToken;
}

async function adminTokenFor(api: APIRequestContext): Promise<string> {
  const r = await api.post(`${API_BASE}/auth/admin/login`, {
    data: { email: 'admin@hd-cpo.local', password: 'Admin@123!' },
  });
  if (!r.ok()) throw new Error('admin login');
  return (await r.json()).accessToken;
}

async function createDraft(api: APIRequestContext, token: string): Promise<string> {
  const create = await api.post(`${API_BASE}/dealer/listings`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      vin: uniqueVin(),
      price: 1_400_000,
      kmsDriven: 15_000,
      owners: 1,
      description: 'QA Bug 2b — Torque hydration smoke.',
      images: ['a', 'b', 'c', 'd', 'e'],
      inspectionReportUrl: null,
      certificationStatus: 'AS_IS',
      cpoDocs: null,
    },
  });
  if (!create.ok()) throw new Error(`create: ${create.status()} ${await create.text()}`);
  return (await create.json()).id as string;
}

async function dealerLogin(page: import('@playwright/test').Page) {
  await page.goto(DEALER_BASE + 'login');
  await page.getByPlaceholder(/vikram@capital-hd/i).fill('gurgaon-hd');
  await page.locator('input[type="password"]').fill('Dealer@123!');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 });
}

async function expectTorqueCardFilled(page: import('@playwright/test').Page) {
  // The "Fetched from Torque DMS" card surfaces three values that the
  // dealer-listing row does NOT persist. Wait for the /torque/vehicles
  // XHR to land before asserting — without that, we'd race the initial
  // synthesised-Torque render (empty strings).
  await page.waitForResponse(
    (r) => r.url().includes('/torque/vehicles/') && r.status() === 200,
    { timeout: 15_000 },
  );

  // Engine + Customer Name + Date of Invoice — each rendered through
  // <ReadOnly label=... value=... /> which renders <dt> + <dd>.
  const labels = ['Engine', 'Customer Name', 'Date of Invoice'];
  for (const label of labels) {
    const labelEl = page.locator('dt', { hasText: new RegExp(`^${label}$`, 'i') }).first();
    await expect(labelEl, `${label} label visible`).toBeVisible();
    const value = await labelEl
      .locator('xpath=following-sibling::dd[1]')
      .first()
      .innerText();
    expect(
      value.trim().length,
      `${label} has non-blank value (got "${value}")`,
    ).toBeGreaterThan(0);
    expect(value.trim()).not.toBe('—');
  }
}

test.describe('Bug 2b — Edit wizard re-fetches Torque to fill Engine / Customer / Date', () => {
  test('DRAFT — open edit wizard, Torque card filled', async ({ page }) => {
    const api = await request.newContext();
    const token = await dealerToken(api);
    const id = await createDraft(api, token);
    await dealerLogin(page);
    await page.goto(`${DEALER_BASE}listings/${id}/edit`);
    await expectTorqueCardFilled(page);
  });

  test('REMOVED — open via View / Restore, Torque card filled', async ({ page }) => {
    const api = await request.newContext();
    const token = await dealerToken(api);
    const admin = await adminTokenFor(api);
    const id = await createDraft(api, token);
    // Admin removes the DRAFT — the canonical QA flow from the bug
    // report (Listings → Drafts → Remove → opens under Removed).
    const remove = await api.post(`${API_BASE}/admin/listings/${id}/remove`, {
      headers: { Authorization: `Bearer ${admin}` },
      data: { reason: 'QA Bug 2b — DRAFT removed by admin so dealer can open it' },
    });
    expect(remove.ok(), 'admin remove').toBeTruthy();
    await dealerLogin(page);
    await page.goto(`${DEALER_BASE}listings/${id}/edit`);
    await expectTorqueCardFilled(page);
  });

  test('DEACTIVATED — open edit wizard, Torque card filled', async ({ page }) => {
    const api = await request.newContext();
    const token = await dealerToken(api);
    const admin = await adminTokenFor(api);
    const id = await createDraft(api, token);
    // DRAFT → ACTIVE → DEACTIVATED (the only legal route to DEACTIVATED).
    await api.post(`${API_BASE}/admin/listings/${id}/publish`, {
      headers: { Authorization: `Bearer ${admin}` },
    });
    await api.post(`${API_BASE}/dealer/listings/${id}/turn-off`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await dealerLogin(page);
    await page.goto(`${DEALER_BASE}listings/${id}/edit`);
    await expectTorqueCardFilled(page);
  });
});
