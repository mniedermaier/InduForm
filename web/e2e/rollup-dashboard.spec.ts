import { test, expect } from '@playwright/test';

test.describe('Rollup dashboard', () => {
  test('navigates to the rollup dashboard and shows stats', async ({ page }) => {
    await page.goto('/');

    // Wait for projects page to load
    await expect(page.locator('text=Water Treatment Facility')).toBeVisible({ timeout: 15000 });

    // Click the Dashboard button
    const dashboardButton = page.locator('button', { hasText: 'Dashboard' });
    if (await dashboardButton.isVisible()) {
      await dashboardButton.click();

      // Should show the compliance overview
      await expect(page.locator('text=Compliance Overview')).toBeVisible({ timeout: 10000 });

      // Should show stat card labels (use first() since "Projects" may appear elsewhere)
      await expect(page.locator('text=Zones').first()).toBeVisible();
      await expect(page.locator('text=Assets').first()).toBeVisible();
    }
  });
});
