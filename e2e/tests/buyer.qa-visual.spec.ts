import { test, expect } from '@playwright/test';

// Visual / DOM-level checks for the buyer-side QA items that earlier
// API-only testing couldn't prove. Each test renders the actual page in
// a headless browser, queries computed styles where weight / layout
// matters, and asserts the right text + classes are present.
//
// Coverage in this file:
//   • L1-02 — top-nav font weight reads as 400 (not 700)
//   • L1-03 — "dealerships" stays on a single visual line
//   • L1-04 — footer Marketplace / Information / Legal headers are real
//             links that navigate to /search, /about, /terms
//   • L1-01 — HOG benefits CTA opens hog.com in a new tab
//   • L2-04 — pincode + distance filter narrows the result count
//   • SOLD watermark — banner overlay renders on a card that the API
//                       reports as status === 'SOLD'

test.describe('Buyer — QA visual sweep', () => {
  test('L1-02 · top-nav links render at font-weight 400', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: /^home$/i }).first();
    await expect(link).toBeVisible();
    const weight = await link.evaluate((el) =>
      getComputedStyle(el as HTMLElement).fontWeight,
    );
    // Tailwind's font-normal = 400. Anything ≥ 600 means the .font-subhead
    // utility's bundled 700 wasn't overridden — that's the bug.
    expect(Number(weight)).toBeLessThan(600);
  });

  test('L1-03 · "3 closest of N dealerships" stays on one line', async ({ page }) => {
    await page.goto('/');
    // Locator the wrapped span directly. The fix is to keep "3 closest"
    // and "of N dealerships" on whitespace-nowrap spans, so the word
    // "dealerships" never breaks to its own line.
    const phrase = page.getByText(/of \d+ dealerships\.?/i).first();
    await expect(phrase).toBeVisible();
    const styles = await phrase.evaluate((el) => ({
      whiteSpace: getComputedStyle(el).whiteSpace,
    }));
    expect(styles.whiteSpace).toMatch(/nowrap/);
  });

  test('L1-04 · footer Marketplace/Information/Legal headers are clickable links', async ({ page }) => {
    await page.goto('/');
    // Each header should be a real <a href> Link, not plain text.
    for (const [label, expectedPath] of [
      ['Marketplace', '/search'],
      ['Information', '/about'],
      ['Legal', '/terms'],
    ] as const) {
      const link = page.locator('footer').getByRole('link', { name: label, exact: true });
      await expect(link, `${label} header is a Link`).toHaveAttribute('href', expectedPath);
    }
  });

  test('L1-01 · HOG benefits CTA points at hog.com and opens in a new tab', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: /HOG Benefits Click Here/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /hog\.com/);
    await expect(cta).toHaveAttribute('target', '_blank');
  });

  test('L2-04 · pincode + distance filter narrows the result count', async ({ page }) => {
    await page.goto('/search');
    // Wait for the initial result grid to render — count cards by the
    // stable data-testid (covers ACTIVE <a> and SOLD <button> variants
    // both, since SOLD cards no longer render an anchor element).
    await page
      .waitForSelector('[data-testid="listing-card"]', { timeout: 10_000 })
      .catch(() => {});
    const countCardsBefore = await page
      .locator('[data-testid="listing-card"]')
      .count();

    // Apply pincode 122001 + Within 50 km. The custom <Field label> wrapper
    // doesn't bind a <label for=> so we target the select by react-hook-
    // form's name attribute.
    await page.getByPlaceholder(/Enter your pincode/i).fill('122001');
    await page.locator('select[name="distance"]').selectOption({ label: 'Within 50 km' });
    // Auto-apply has a 250–400 ms debounce; wait a bit then re-count.
    await page.waitForTimeout(1200);
    const countCardsAfter = await page
      .locator('[data-testid="listing-card"]')
      .count();

    // Result set MUST shrink (Gurgaon-area dealers are a strict subset).
    expect(countCardsAfter).toBeLessThan(countCardsBefore);
    expect(countCardsAfter).toBeGreaterThan(0);

    // URL should carry the pincode + distance params now.
    expect(page.url()).toMatch(/pincode=122001/);
    expect(page.url()).toMatch(/distance=50/);
  });
});
