import { test, expect } from '@playwright/test';

// Visual / DOM-level checks for the dealer-side QA items.
//
// Coverage:
//   • L1-06 — Forgot Password is a real <button>, not plain text
//   • L1-07 — login page does not produce a vertical scrollbar
//   • L1-08 — dashboard tile labels carry no "(7d)" suffix
//   • L1-09 — "New Listings" tile present (renamed from "New Leads")
//   • L1-13 — lead detail breadcrumb reads "Back to Buyer Enquiries"
//             / "Back to Seller Enquiries" (NOT "Leads")
//   • L1-14 — Add Listing wizard renders an upload arrow on every empty
//             photo tile (not just Front)
//   • L2-11 — seller pipeline bar shows 7 numbered stages with the new
//             friendly labels (Documentation Verification, etc.)

async function dealerLogin(page: import('@playwright/test').Page) {
  await page.goto('login');
  await page.getByPlaceholder(/vikram@capital-hd/i).fill('gurgaon-hd');
  await page.locator('input[type="password"]').fill('Dealer@123!');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 });
}

test.describe('Dealer — QA visual sweep', () => {
  test('L1-06 · Forgot Password is a clickable button', async ({ page }) => {
    await page.goto('login');
    const forgot = page.getByRole('button', { name: /forgot password/i });
    await expect(forgot).toBeVisible();
    // Must be a real <button>, not a plain <span>.
    const tag = await forgot.evaluate((el) => el.tagName);
    expect(tag).toBe('BUTTON');
  });

  test('L1-07 · login page does not produce vertical scroll', async ({ page }) => {
    await page.goto('login');
    const overflow = await page.evaluate(() => {
      const html = document.documentElement;
      return {
        scrollHeight: html.scrollHeight,
        clientHeight: html.clientHeight,
        bodyOverflow: getComputedStyle(document.body).overflow,
        rootOverflow: getComputedStyle(html).overflow,
      };
    });
    // h-screen overflow-hidden caps the page to viewport height. Allow a
    // 4-px slack for sub-pixel rounding across browsers.
    expect(overflow.scrollHeight - overflow.clientHeight).toBeLessThanOrEqual(4);
  });

  test('L1-08/09 · dashboard tiles drop "(7d)" + show "New Listings"', async ({ page }) => {
    await dealerLogin(page);
    await page.goto('dashboard');
    // No "(7d)" anywhere in the visible page text.
    await expect(page.locator('body')).not.toContainText(/\(7d\)/i);
    // "New Listings" tile present (renamed from "New Leads").
    await expect(page.getByText(/^New Listings$/).first()).toBeVisible();
    // Old "New Leads" label must be gone.
    await expect(page.locator('body')).not.toContainText(/^New Leads$/);
  });

  test('L1-13 · lead detail breadcrumb says Buyer/Seller Enquiries', async ({ page }) => {
    await dealerLogin(page);
    await page.goto('leads/buyer');
    // Open the first lead row.
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    // Click the row's open link.
    await firstRow.getByRole('link', { name: /open/i }).first().click();
    await page.waitForURL(/\/leads\/buyer\/[^/]+$/);
    await expect(page.getByText(/← Back to Buyer Enquiries/i)).toBeVisible();
    // And NOT "Leads" anywhere in that link's text.
    await expect(page.getByText(/← Back to Buyer Leads/i)).toHaveCount(0);
  });

  test('L1-14 · Add Listing renders upload arrow on every empty photo tile', async ({ page }) => {
    await dealerLogin(page);
    await page.goto('listings/new');

    // The five empty slot tiles each carry the Front/Side/Rear/Engine/
    // Cockpit label inside a <label> with the file-input `for=` reference.
    const slotLabels = ['Front', 'Side', 'Rear', 'Engine', 'Cockpit'];
    for (const label of slotLabels) {
      // Scope to the tile bearing this slot label, then assert it
      // contains the upload-arrow SVG path "M12 19V5".
      const tile = page.locator('label', { hasText: new RegExp(`^${label}`, 'i') }).first();
      await expect(tile, `${label} tile renders`).toBeVisible();
      const hasArrow = await tile.evaluate((el) => {
        const path = el.querySelector('svg path');
        return !!(path && (path.getAttribute('d') ?? '').startsWith('M12 19V5'));
      });
      expect(hasArrow, `${label} tile has the orange upload arrow`).toBeTruthy();
    }
  });

  test('L2-11 · seller pipeline bar shows 7 stages with friendly labels', async ({ page }) => {
    await dealerLogin(page);
    await page.goto('leads/trade-in');
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.getByRole('link', { name: /open/i }).first().click();
    await page.waitForURL(/\/leads\/trade-in\/[^/]+$/);

    // The numbered pipeline bar's <ol> sits inside the section whose
    // heading reads "Pipeline" — scope to that to avoid matching the
    // activity timeline's <ol> (which can have 10+ entries on a lead
    // that's been moved through stages a few times).
    const pipelineSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: /^Pipeline$/i }),
    });
    const stages = pipelineSection.locator('> ol > li');
    await expect(stages).toHaveCount(7);

    // Each of the 7 expected friendly labels is rendered inside the bar.
    for (const label of [
      'Enquiry Received',
      'Documentation Verification',
      'Technical Inspection',
      'Valuation & Offer',
      'Negotiation & Acceptance',
      'Legal Transfer & Documentation',
      'Trade-In Finalized',
    ]) {
      await expect(pipelineSection.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });
});
