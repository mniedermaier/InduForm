import { test, expect } from '@playwright/test';

test.describe('Demo mode smoke tests', () => {
  test('loads the projects page with demo data', async ({ page }) => {
    await page.goto('/');

    // Demo mode injects auth tokens and shows the projects list
    await expect(page.locator('text=Water Treatment Facility')).toBeVisible({ timeout: 15000 });
  });

  test('demo user is authenticated', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to initialize
    await expect(page.locator('text=Water Treatment Facility')).toBeVisible({ timeout: 15000 });

    // Check that auth tokens were injected by enableDemoMode
    const accessToken = await page.evaluate(() =>
      localStorage.getItem('induform_access_token')
    );
    expect(accessToken).toBe('demo-access-token');
  });

  test('shows InduForm branding', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=InduForm')).toBeVisible({ timeout: 15000 });
  });

  test('shows New Project button', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=Water Treatment Facility')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=New Project')).toBeVisible();
  });
});
