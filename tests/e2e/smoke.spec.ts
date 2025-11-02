import { test, expect } from '@playwright/test';

test('loads dashboard and shows heading', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard/);
  // Heading text is localized; check by role and text
  await expect(page.getByRole('heading', { name: /日次ピックアップ/ })).toBeVisible();
});

