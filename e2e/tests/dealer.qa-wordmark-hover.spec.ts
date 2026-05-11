import { test, expect } from '@playwright/test';

// L1-10 — Wordmark hover bug.
//
// The QA bug was that hovering the H-D Certified™ wordmark lockup turned
// the dealer name orange and showed a hand cursor over the dealer name —
// because both the logo image and the name were wrapped in a single
// <Link>. Fix moved the Link to wrap only the <img>, leaving the dealer
// name as a plain <span>.
//
// What we assert here:
//   • The dealer-name <span> has cursor: default (no hand on hover).
//   • Hovering the wordmark area does NOT change the dealer-name colour
//     (no orange flash).
//   • Clicking the wordmark navigates to /dashboard.

async function dealerLogin(page: import('@playwright/test').Page) {
  await page.goto('login');
  await page.getByPlaceholder(/vikram@capital-hd/i).fill('gurgaon-hd');
  await page.locator('input[type="password"]').fill('Dealer@123!');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 });
}

test.describe('Dealer — Wordmark hover (L1-10)', () => {
  test('dealer name span does not turn orange on hover + cursor stays default', async ({
    page,
  }) => {
    await dealerLogin(page);
    // The dealer name is rendered at sm: breakpoint; ensure desktop width.
    await page.setViewportSize({ width: 1280, height: 800 });

    const wordmarkLink = page.locator('a[aria-label*="H-D Certified"]').first();
    await expect(wordmarkLink, 'wordmark link visible').toBeVisible();

    // The dealer name span sits as a SIBLING of the wordmark link inside
    // the header lockup — not inside it. That separation IS the fix.
    const dealerName = page.locator('span.font-headline.tracking-headline').first();
    await expect(dealerName, 'dealer name span visible').toBeVisible();

    // Hover the wordmark and read computed styles on the dealer name.
    const beforeColor = await dealerName.evaluate((el) => getComputedStyle(el).color);
    await wordmarkLink.hover();
    // Give any CSS transition a tick to settle.
    await page.waitForTimeout(150);
    const afterHoverColor = await dealerName.evaluate((el) => getComputedStyle(el).color);
    expect(afterHoverColor, 'dealer name colour stable on wordmark hover').toBe(beforeColor);

    // Hover the dealer name directly — cursor must be default, not pointer,
    // and colour must still not change.
    await dealerName.hover();
    await page.waitForTimeout(150);
    const nameCursor = await dealerName.evaluate((el) => getComputedStyle(el).cursor);
    expect(nameCursor, 'dealer name cursor is default').not.toBe('pointer');
    const afterNameHoverColor = await dealerName.evaluate((el) => getComputedStyle(el).color);
    expect(afterNameHoverColor).toBe(beforeColor);

    // The dealer name must not be inside an <a>; if it were, the hand
    // cursor would come back.
    const isInsideLink = await dealerName.evaluate((el) => !!el.closest('a'));
    expect(isInsideLink, 'dealer name is NOT wrapped in an <a>').toBe(false);

    // Clicking the wordmark image navigates to /dashboard.
    await wordmarkLink.click();
    await page.waitForURL(/\/dashboard$/);
  });
});
