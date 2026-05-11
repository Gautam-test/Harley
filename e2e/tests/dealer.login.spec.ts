import { test, expect } from '@playwright/test';

// Dealer auth — protects every dealer route. If this regresses we lose the
// entire portal. The login form uses placeholder-only inputs (no label/for
// linkage) so we target via placeholder.
async function dealerLogin(page: import('@playwright/test').Page) {
  await page.goto('login');
  // Username field — placeholder is the seeded sample address
  await page.getByPlaceholder(/vikram@capital-hd/i).fill('gurgaon-hd');
  // Password field — placeholder is the dot mask
  await page.locator('input[type="password"]').fill('Dealer@123!');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 });
}

test.describe('Dealer — Authentication', () => {
  test('login page renders both inputs', async ({ page }) => {
    await page.goto('login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByPlaceholder(/vikram@capital-hd/i)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('successful login lands on dashboard', async ({ page }) => {
    await dealerLogin(page);
    // Dashboard chrome shows the dealer name
    await expect(page.getByText(/Capital Harley-Davidson/i).first()).toBeVisible();
  });

  test('My Listings tab bar uses Figma terminology (Pending / Live / Off)', async ({ page }) => {
    await dealerLogin(page);
    await page.goto('listings');
    // Tab labels — the relabel from DRAFT/ACTIVE/DEACTIVATED to Pending/Live/Off
    // is one of the Figma-fidelity wins; locking it down here.
    for (const label of ['All', 'Pending', 'Live', 'Off', 'Sold', 'Removed']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).first()).toBeVisible();
    }
  });
});
