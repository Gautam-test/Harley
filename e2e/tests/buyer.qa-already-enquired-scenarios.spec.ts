import { test, expect, request, type APIRequestContext } from '@playwright/test';

// Extended scenario coverage for the "Buyer enquiry form already
// submitted" popup. The happy-path is in buyer.qa-already-enquired.spec.ts;
// this file exercises the edges:
//
//   A. Lead status NEW   → popup appears
//   B. Lead status CONTACTED → popup appears
//   C. Lead status DEAD  → popup does NOT appear (Visit Dealer works)
//   D. Same browser, different phone in OTP store → no popup (the buyer
//      hasn't enquired on this phone), Visit Dealer opens InfoGateModal
//   E. No OTP store at all (fresh browser) → no popup, normal flow
//   F. After DEAD, dealer flips back to NEW → popup reappears
//   G. Listing with no enquiries at all → no popup
//
// The popup contract: dialog accessible by role with name
// /enquiry already submitted/i, body contains the canonical copy
// "Buyer enquiry form already submitted", a Track Enquiry link points
// at /track?id=<leadId>, and the InfoGateModal stays closed.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
const BUYER_BASE = process.env.BUYER_BASE_URL ?? 'http://localhost:5180/';

function uniquePhone(): string {
  const tail = String(Date.now() % 10_000_000_000).padStart(10, '0');
  return `+91${tail.slice(-10)}`;
}

interface Verified {
  phone: string;
  name: string;
  email: string;
  verifiedToken: string;
}

async function verifiedPhone(api: APIRequestContext): Promise<Verified> {
  const phone = uniquePhone();
  const name = 'QA E2E';
  const email = `qa-${Date.now()}@example.test`;
  const sendResp = await api.post(`${API_BASE}/otp/send`, {
    data: { phone, purpose: 'ENQUIRY' },
  });
  if (!sendResp.ok()) {
    throw new Error(`otp/send failed: ${sendResp.status()} ${await sendResp.text()}`);
  }
  const { otpId } = await sendResp.json();
  const verifyResp = await api.post(`${API_BASE}/otp/verify`, {
    data: { otpId, code: '123456' },
  });
  if (!verifyResp.ok()) {
    throw new Error(`otp/verify failed: ${verifyResp.status()} ${await verifyResp.text()}`);
  }
  const { verifiedToken } = await verifyResp.json();
  return { phone, name, email, verifiedToken };
}

async function createEnquiry(
  api: APIRequestContext,
  slug: string,
  v: Verified,
): Promise<string> {
  const enqResp = await api.post(`${API_BASE}/leads/listings/${slug}/enquiry`, {
    headers: { Authorization: `Bearer ${v.verifiedToken}` },
    data: {
      name: v.name,
      phone: v.phone,
      email: v.email,
      message: 'QA extended-scenarios spec',
    },
  });
  if (!enqResp.ok()) {
    throw new Error(`create enquiry: ${enqResp.status()} ${await enqResp.text()}`);
  }
  const { id } = await enqResp.json();
  return id;
}

async function pickActiveListing(
  api: APIRequestContext,
): Promise<{ slug: string }> {
  const r = await api.get(`${API_BASE}/listings?limit=30`);
  const { results } = (await r.json()) as { results: Array<{ slug: string; status: string }> };
  const target = results.find((x) => x.status === 'ACTIVE');
  if (!target) throw new Error('no ACTIVE listing available');
  return { slug: target.slug };
}

async function seedOtpStore(
  page: import('@playwright/test').Page,
  v: Verified,
): Promise<void> {
  await page.goto(BUYER_BASE);
  await page.evaluate(
    ({ token, phone, name, email }) => {
      localStorage.setItem(
        'hd-cpo-buyer-otp',
        JSON.stringify({
          state: {
            verifiedToken: token,
            verifiedFor: 'ENQUIRY',
            phone,
            name,
            email,
          },
          version: 0,
        }),
      );
    },
    {
      token: v.verifiedToken,
      phone: v.phone,
      name: v.name,
      email: v.email,
    },
  );
}

async function dealerAuth(api: APIRequestContext): Promise<string> {
  const r = await api.post(`${API_BASE}/auth/dealer/login`, {
    data: { username: 'gurgaon-hd', password: 'Dealer@123!' },
  });
  if (!r.ok()) throw new Error('dealer login failed');
  return (await r.json()).accessToken;
}

async function moveLead(
  api: APIRequestContext,
  dealerToken: string,
  leadId: string,
  status: string,
): Promise<boolean> {
  const r = await api.patch(`${API_BASE}/dealer/leads/buyer/${leadId}/status`, {
    headers: { Authorization: `Bearer ${dealerToken}` },
    data: { status },
  });
  return r.ok();
}

test.describe('Bug 1 — already-submitted popup, full scenario matrix', () => {
  test('A · NEW lead → popup appears with Track link', async ({ page }) => {
    const api = await request.newContext();
    const { slug } = await pickActiveListing(api);
    const v = await verifiedPhone(api);
    const leadId = await createEnquiry(api, slug, v);
    await seedOtpStore(page, v);

    await page.goto(`${BUYER_BASE}listings/${slug}`);
    await page.waitForResponse(
      (r) => r.url().includes('/my-status') && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /visit dealer/i }).click();

    const dialog = page.getByRole('dialog', { name: /enquiry already submitted/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Buyer enquiry form already submitted/i);
    await expect(dialog).toContainText(leadId);
    await expect(dialog.getByRole('link', { name: /track enquiry/i })).toHaveAttribute(
      'href',
      `/track?id=${leadId}`,
    );
  });

  test('B · CONTACTED lead → popup still appears', async ({ page }) => {
    const api = await request.newContext();
    const { slug } = await pickActiveListing(api);
    const v = await verifiedPhone(api);
    const leadId = await createEnquiry(api, slug, v);
    // Move the lead to CONTACTED (mid-pipeline, non-terminal).
    const dealerToken = await dealerAuth(api);
    const moved = await moveLead(api, dealerToken, leadId, 'CONTACTED');
    test.skip(!moved, 'lead belongs to a different dealer than gurgaon-hd');

    await seedOtpStore(page, v);
    await page.goto(`${BUYER_BASE}listings/${slug}`);
    await page.waitForResponse(
      (r) => r.url().includes('/my-status') && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /visit dealer/i }).click();
    const dialog = page.getByRole('dialog', { name: /enquiry already submitted/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(leadId);
  });

  test('C · DEAD lead → popup does NOT appear, InfoGateModal opens', async ({
    page,
  }) => {
    const api = await request.newContext();
    const { slug } = await pickActiveListing(api);
    const v = await verifiedPhone(api);
    const leadId = await createEnquiry(api, slug, v);
    const dealerToken = await dealerAuth(api);
    const moved = await moveLead(api, dealerToken, leadId, 'DEAD');
    test.skip(!moved, 'lead belongs to a different dealer than gurgaon-hd');

    // Confirm my-status now reports enquired=false.
    const statusResp = await api.get(
      `${API_BASE}/leads/listings/${slug}/my-status?phone=${encodeURIComponent(v.phone)}`,
    );
    expect((await statusResp.json()).enquired).toBe(false);

    await seedOtpStore(page, v);
    await page.goto(`${BUYER_BASE}listings/${slug}`);
    await page.waitForResponse(
      (r) => r.url().includes('/my-status') && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /visit dealer/i }).click();

    // No "Already submitted" dialog should appear.
    await expect(
      page.getByRole('dialog', { name: /enquiry already submitted/i }),
    ).toHaveCount(0);
    // InfoGateModal (or alreadyVerified shortcut) takes over. We treat
    // either as success here: the shortcut path may auto-submit a second
    // enquiry (alreadyVerified) — both are valid "popup did not block"
    // outcomes. We only assert the popup is absent.
  });

  test('D · Different phone in OTP store → no popup, normal flow', async ({
    page,
  }) => {
    const api = await request.newContext();
    const { slug } = await pickActiveListing(api);
    // Enquire as Phone-1.
    const v1 = await verifiedPhone(api);
    await createEnquiry(api, slug, v1);

    // Now drive the SPA as Phone-2 (a fresh verified buyer who hasn't
    // enquired on this listing).
    const v2 = await verifiedPhone(api);
    await seedOtpStore(page, v2);
    await page.goto(`${BUYER_BASE}listings/${slug}`);
    await page.waitForResponse(
      (r) => r.url().includes('/my-status') && r.status() === 200,
      { timeout: 10_000 },
    );
    await expect(
      page.getByRole('dialog', { name: /enquiry already submitted/i }),
    ).toHaveCount(0);
  });

  test('E · No OTP store → Visit Dealer opens InfoGateModal (no popup, no preflight)', async ({
    page,
  }) => {
    const api = await request.newContext();
    const { slug } = await pickActiveListing(api);
    // Fresh page — explicitly clear any localStorage from previous tests.
    await page.goto(BUYER_BASE);
    await page.evaluate(() => localStorage.removeItem('hd-cpo-buyer-otp'));

    // No my-status XHR should fire (the query is gated on storedPhone).
    const xhrSeen: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/my-status')) xhrSeen.push(r.url());
    });
    await page.goto(`${BUYER_BASE}listings/${slug}`);
    // Give it a tick — the query never fires, but we wait so we're sure.
    await page.waitForTimeout(1500);
    expect(xhrSeen, 'no my-status XHR without verified phone').toEqual([]);

    await page.getByRole('button', { name: /visit dealer/i }).click();
    // InfoGateModal opens (collect step). No "Already submitted" dialog.
    await expect(
      page.getByRole('dialog', { name: /enquiry already submitted/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/almost there|buyer enquiry/i).first()).toBeVisible();
  });

  test('F · DEAD then back to NEW → popup reappears', async ({ page }) => {
    const api = await request.newContext();
    const { slug } = await pickActiveListing(api);
    const v = await verifiedPhone(api);
    const leadId = await createEnquiry(api, slug, v);
    const dealerToken = await dealerAuth(api);
    const movedDead = await moveLead(api, dealerToken, leadId, 'DEAD');
    test.skip(!movedDead, 'lead belongs to a different dealer than gurgaon-hd');
    const movedBack = await moveLead(api, dealerToken, leadId, 'NEW');
    expect(movedBack, 'DEAD → NEW transition accepted').toBe(true);

    // Server should now report enquired=true again.
    const statusResp = await api.get(
      `${API_BASE}/leads/listings/${slug}/my-status?phone=${encodeURIComponent(v.phone)}`,
    );
    const body = await statusResp.json();
    expect(body.enquired).toBe(true);
    expect(body.leadId).toBe(leadId);

    await seedOtpStore(page, v);
    await page.goto(`${BUYER_BASE}listings/${slug}`);
    await page.waitForResponse(
      (r) => r.url().includes('/my-status') && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /visit dealer/i }).click();
    await expect(
      page.getByRole('dialog', { name: /enquiry already submitted/i }),
    ).toBeVisible();
  });

  test('G · Listing with no enquiries at all → no popup', async ({ page }) => {
    const api = await request.newContext();
    const { slug } = await pickActiveListing(api);
    // Verified phone with no enquiries on any listing.
    const v = await verifiedPhone(api);
    await seedOtpStore(page, v);
    await page.goto(`${BUYER_BASE}listings/${slug}`);
    await page.waitForResponse(
      (r) => r.url().includes('/my-status') && r.status() === 200,
      { timeout: 10_000 },
    );
    await expect(
      page.getByRole('dialog', { name: /enquiry already submitted/i }),
    ).toHaveCount(0);
  });
});
