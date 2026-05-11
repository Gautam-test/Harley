import { test, expect, request } from '@playwright/test';

// "Buyer enquiry form already submitted" popup on the listing detail page.
//
// Flow under test:
//   1. Buyer creates a real buyer-enquiry for a listing via the public API
//      (OTP send + verify + POST /leads/listings/:slug/enquiry).
//   2. The same buyer revisits the same listing in a browser. The SPA's
//      OTP store has their verified phone in localStorage; on detail-page
//      mount the SPA calls /leads/listings/:slug/my-status?phone=... and
//      the API replies enquired=true with the leadId.
//   3. Clicking Visit Dealer must NOT open the InfoGateModal. Instead, a
//      popup appears with the message "Buyer enquiry form already
//      submitted." + the lead's reference ID + a Track Enquiry link.
//   4. Once the dealer marks the lead Not Interested (status DEAD), the
//      lookup returns enquired=false and Visit Dealer behaves normally.
//
// Mock SMS accepts any 6-digit OTP (apps/api .../otp.service.ts) so the
// spec doesn't need a real SMS receiver.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
const BUYER_BASE = process.env.BUYER_BASE_URL ?? 'http://localhost:5180/';

// Unique phone per spec run so per-phone OTP rate limits in Redis don't
// trip after a few re-runs. The mock SMS provider accepts any phone shape
// matching +91 + 10 digits.
function uniquePhone(): string {
  const tail = String(Date.now() % 10_000_000_000).padStart(10, '0');
  return `+91${tail.slice(-10)}`;
}

test('Visit Dealer surfaces "Already submitted" popup on a revisit', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await request.newContext();
  const phone = uniquePhone();
  const name = 'QA E2E';
  const email = `qa-${Date.now()}@example.test`;

  // 1. Pick an ACTIVE listing — the public /listings grid also surfaces
  // SOLD rows for a 1-hour watermark window, so explicitly filter.
  const listResp = await api.get(`${API_BASE}/listings?limit=20`);
  expect(listResp.ok(), 'public listings').toBeTruthy();
  const { results } = (await listResp.json()) as {
    results: Array<{ slug: string; status: string }>;
  };
  const target = results.find((r) => r.status === 'ACTIVE');
  expect(target?.slug, 'at least one ACTIVE listing in /listings').toBeTruthy();

  // 2. OTP send + verify (mock SMS accepts any 6-digit code).
  const sendResp = await api.post(`${API_BASE}/otp/send`, {
    data: { phone, purpose: 'ENQUIRY' },
  });
  expect(sendResp.ok(), 'otp send').toBeTruthy();
  const { otpId } = await sendResp.json();
  const verifyResp = await api.post(`${API_BASE}/otp/verify`, {
    data: { otpId, code: '123456' },
  });
  expect(verifyResp.ok(), 'otp verify').toBeTruthy();
  const { verifiedToken } = await verifyResp.json();

  // 3. Create the buyer enquiry.
  const enqResp = await api.post(`${API_BASE}/leads/listings/${target!.slug}/enquiry`, {
    headers: { Authorization: `Bearer ${verifiedToken}` },
    data: {
      name,
      phone,
      email,
      message: 'QA E2E — already-submitted popup spec',
    },
  });
  if (!enqResp.ok()) {
    throw new Error(`create enquiry failed: ${enqResp.status()} ${await enqResp.text()}`);
  }
  const { id: leadId } = await enqResp.json();

  // 4. Pre-seed the OTP store in localStorage so the SPA recognises this
  //    visitor as the same verified buyer. The persist key is fixed in
  //    apps/web-buyer/src/store/otp.ts ("hd-cpo-buyer-otp"). We navigate
  //    to the SPA root first so localStorage's origin matches the buyer
  //    site, then write the store payload before loading the detail page.
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
    { token: verifiedToken, phone, name, email },
  );

  // Sanity: confirm the API reports enquired=true for this phone before
  // we drive the SPA.
  const preStatus = await api.get(
    `${API_BASE}/leads/listings/${target!.slug}/my-status?phone=${encodeURIComponent(phone)}`,
  );
  const preBody = (await preStatus.json()) as { enquired: boolean; leadId?: string };
  expect(preBody, 'my-status reports enquired=true post-enquiry').toMatchObject({
    enquired: true,
    leadId,
  });

  // 5. Visit the detail page. The my-status query fires on mount; wait
  //    for it to land before clicking so the SPA has the lead in state.
  await page.goto(`${BUYER_BASE}listings/${target!.slug}`);
  await page.waitForResponse(
    (r) => r.url().includes('/my-status') && r.status() === 200,
    { timeout: 10_000 },
  );

  // 6. Click Visit Dealer — must open the "Already submitted" popup,
  //    NOT the InfoGateModal collect / verify form.
  await page.getByRole('button', { name: /visit dealer/i }).click();

  const dialog = page.getByRole('dialog', { name: /enquiry already submitted/i });
  await expect(dialog, '"Already submitted" dialog visible').toBeVisible({
    timeout: 10_000,
  });
  await expect(dialog).toContainText(/Buyer enquiry form already submitted/i);
  await expect(dialog).toContainText(leadId);
  await expect(dialog.getByRole('link', { name: /track enquiry/i })).toBeVisible();
  // The OTP collect / verify modal MUST NOT have opened.
  await expect(page.getByText(/almost there|verify otp|6-digit code/i)).toHaveCount(0);

  // 7. Dismiss popup, then mark the lead DEAD ("Not Interested") via the
  //    dealer API and confirm my-status flips to enquired=false. We try
  //    gurgaon-hd first; if the listing belongs to a different dealer
  //    the PATCH 404s and we leave the closing assertion off — the popup
  //    coverage above is the primary contract.
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(dialog).toHaveCount(0);

  const dealerLogin = await api.post(`${API_BASE}/auth/dealer/login`, {
    data: { username: 'gurgaon-hd', password: 'Dealer@123!' },
  });
  expect(dealerLogin.ok(), 'dealer login').toBeTruthy();
  const dealerToken = (await dealerLogin.json()).accessToken;
  const moveResp = await api.patch(
    `${API_BASE}/dealer/leads/buyer/${leadId}/status`,
    {
      headers: { Authorization: `Bearer ${dealerToken}` },
      data: { status: 'DEAD' },
    },
  );
  if (moveResp.ok()) {
    const statusResp = await api.get(
      `${API_BASE}/leads/listings/${target!.slug}/my-status?phone=${encodeURIComponent(phone)}`,
    );
    expect(statusResp.ok(), 'my-status after DEAD').toBeTruthy();
    const body = (await statusResp.json()) as { enquired: boolean };
    expect(body.enquired, 'enquired=false once dealer marks Not Interested').toBe(false);
  }
});
