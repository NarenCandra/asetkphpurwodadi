import {expect, test} from '@playwright/test';

test('menu mobile dapat dibuka dan tidak ada scroll horizontal', async ({page}) => {
  await page.goto('/rumah');
  const toggle = page.locator('.menu-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('navigation', {name: 'Navigasi utama'}).getByRole('link', {name: 'Masuk', exact: true})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('halaman masuk dan daftar dapat dipakai di ponsel', async ({page}) => {
  await page.goto('/daftar');
  await expect(page.locator('#name')).toBeVisible();
  await expect(page.locator('#auth-form button[type=submit]')).toBeVisible();
});
