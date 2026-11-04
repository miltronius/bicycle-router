import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Tiles are irrelevant to the smoke test and slow it down
  await page.route(/tile|wmts|arcgisonline|basemaps|waymarkedtrails/, r => r.abort());
});

test('plans the default route and shows all profile cards', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.route-card.active')).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(5);
  await expect(page).toHaveURL(/wp=47\.37730/);
  await expect(page.getByText('Ø', { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('adds a place along the route as a stop', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.route-card.active')).toBeVisible();
  await page.locator('aside').getByRole('button', { name: '+ stop', exact: true }).first().click();
  await expect(page.locator('aside input[type=text]')).toHaveCount(3);
  await expect(page.locator('.route-card.active')).toBeVisible();
  await expect(page).toHaveURL(/wp=[^&]*%7C[^&]*%7C|wp=[^&]*\|[^&]*\|/);
});

test('search replaces the destination', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.route-card.active')).toBeVisible();
  await page.locator('aside button[aria-label^="Clear Destination"]').dispatchEvent('mousedown');
  const dest = page.locator('aside input[type=text]').last();
  await dest.fill('Uetli');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(dest).toHaveValue(/Uetliberg/);
});

test('URL state restores stops and selected profile', async ({ page }) => {
  await page.goto('/?wp=47.37730,8.53740~Start|47.36000,8.52000~Via|47.27520,8.45280~End&p=safety');
  await expect(page.locator('.route-card.active')).toContainText('Safety');
  await expect(page.locator('aside input[type=text]')).toHaveCount(3);
});

test('live mode shows the HUD and a ride summary', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.route-card.active')).toBeVisible();
  await page.getByRole('button', { name: '▶ Start ride', exact: true }).click();
  await expect(page.locator('.live-hud')).toBeVisible();
  await context.setGeolocation({ latitude: 47.3760, longitude: 8.5362, accuracy: 5 });
  await expect(page.locator('.live-hud')).toContainText('to go');
  await context.setGeolocation({ latitude: 47.3745, longitude: 8.5350, accuracy: 5 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '■ End ride', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ride summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save GPX' })).toBeVisible();
});

test('safety colouring and e-bike battery estimate', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.route-card.active')).toBeVisible();
  await page.getByText('Rider & bike').click();
  await page.getByRole('button', { name: 'E-bike 25', exact: true }).click();
  await expect(page.locator('.route-card.active')).toContainText('🔋');
  await page.getByText('Map & layers').click();
  await page.getByRole('button', { name: 'safety', exact: true }).click();
  await expect(page.getByText('Mixed traffic')).toBeVisible();
});
