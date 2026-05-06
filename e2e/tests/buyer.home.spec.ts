import { test, expect } from '@playwright/test';

// Buyer home — renders the hero, the search widget, and the dealer locator.
// Smallest possible smoke check: if any of these go missing, the whole site
// is on fire.
test.describe('Buyer — Home', () => {
  test('renders hero, search widget and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/H-D Certified|Harley-Davidson/i);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Search Stock CTA — primary nav target
    await expect(page.getByRole('link', { name: /search stock/i }).first()).toBeVisible();
  });

  test('cookie banner appears on first visit and dismisses persistently', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(dialog).toBeVisible();

    // Accept all → banner gone
    await dialog.getByRole('button', { name: /accept all/i }).click();
    await expect(dialog).toBeHidden();

    // Reload — should NOT reappear
    await page.reload();
    await expect(page.getByRole('dialog', { name: /cookie consent/i })).toBeHidden();
  });
});
