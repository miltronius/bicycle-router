import { test, expect } from '@playwright/test';

test('mobile: open sheet, select route, swipe to close', async ({ page }) => {
  await page.route(/tile|wmts|arcgisonline|basemaps|waymarkedtrails/, r => r.abort());
  await page.goto('/');
  const badge = page.locator('button.md\\:hidden').filter({ hasText: /Fastest|Low|Balanced|Car|Safety/ });
  await expect(badge).toBeVisible();
  await badge.click();
  const sheet = page.locator('aside.mobile-open');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(450); // let the slide-in transition finish before measuring the handle
  const handle = page.locator('.sheet-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('aside.mobile-open')).toHaveCount(0);
});
