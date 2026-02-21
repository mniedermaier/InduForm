import { test, expect } from '@playwright/test';

test.describe('Project editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for projects page to load
    await expect(page.locator('text=Water Treatment Facility')).toBeVisible({ timeout: 15000 });
  });

  test('opens a project and shows the editor', async ({ page }) => {
    // Click on the project card
    await page.locator('text=Water Treatment Facility').first().click();

    // The editor should load — project name appears in the header
    await expect(page.locator('[aria-label="Back to Projects"]')).toBeVisible({ timeout: 10000 });
  });

  test('shows the project name in the editor header', async ({ page }) => {
    await page.locator('text=Water Treatment Facility').first().click();

    // Wait for editor to load
    await expect(page.locator('[aria-label="Back to Projects"]')).toBeVisible({ timeout: 10000 });

    // Project name should be visible in the header
    await expect(page.locator('text=Water Treatment Facility').first()).toBeVisible();
  });

  test('can navigate back to projects list', async ({ page }) => {
    await page.locator('text=Water Treatment Facility').first().click();

    // Wait for editor to load
    await expect(page.locator('[aria-label="Back to Projects"]')).toBeVisible({ timeout: 10000 });

    // Click back to return to projects
    await page.locator('[aria-label="Back to Projects"]').click();

    // Should be back on the projects page — "New Project" button is unique to projects page
    await expect(page.locator('text=New Project')).toBeVisible({ timeout: 10000 });
  });
});
