import { test, expect } from '@playwright/test';

// Buyer tracking — both the empty state and the not-found error path.
// Happy-path tracking is covered by api.flow.spec.ts because creating a real
// enquiry requires an OTP token and a listing slug; it's faster and more
// reliable to exercise that contract directly through the API.
test.describe('Buyer — Track page', () => {
  test('empty state shows the how-to-track explainer', async ({ page }) => {
    await page.goto('/track');
    await expect(page.getByRole('heading', { name: /how to track your bike/i })).toBeVisible();
    // Three numbered steps
    await expect(page.getByText('Get Your Tracking Number')).toBeVisible();
    await expect(page.getByText('Enter Tracking ID')).toBeVisible();
    await expect(page.getByText('Check Status')).toBeVisible();
  });

  test('bogus ID surfaces a friendly not-found card', async ({ page }) => {
    await page.goto('/track');
    await page.getByPlaceholder(/enter order or enquiry id/i).fill('not-a-real-id-1234567890');
    await page.getByRole('button', { name: /track/i }).click();
    await expect(page.getByText(/not found/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
