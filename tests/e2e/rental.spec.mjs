import {expect, test} from '@playwright/test';
import {PDF, firstAsset, loginAdmin} from './helpers.mjs';

test.describe.configure({mode: 'serial'});

const email = `siti.${Date.now()}@contoh.id`;
let assetPath;
let page;
let adminPage;

test.beforeAll(async ({browser}) => {
  page = await (await browser.newContext()).newPage();
  adminPage = await (await browser.newContext()).newPage();
});
test.afterAll(async () => { await page.context().close(); await adminPage.context().close(); });

test('katalog publik menampilkan aset dan navbar lengkap', async () => {
  await page.goto('/rumah');
  await expect(firstAsset(page)).toBeVisible();
  const nav = page.getByRole('navigation', {name: 'Navigasi utama'});
  for (const name of ['Beranda', 'Daftar Aset', 'Tentang & Kontak', 'Masuk']) await expect(nav.getByRole('link', {name, exact: true})).toBeVisible();
  const header = await page.locator('.header-inner').boundingBox();
  expect(header.height).toBeGreaterThanOrEqual(96);  // navbar dilebarkan
});

test('survei tanpa login diarahkan ke masuk lalu kembali setelah daftar', async () => {
  await firstAsset(page).click();
  assetPath = new URL(page.url()).pathname;
  await page.locator('#survey-btn').click();
  await expect(page).toHaveURL(/\/masuk\?next=/);
  await page.getByRole('link', {name: 'Daftar', exact: true}).click();
  await page.locator('#name').fill('Siti Uji');
  await page.locator('#whatsapp').fill('081234567890');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('rahasia-uji-1');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page).toHaveURL(assetPath);
  await expect(page.locator('#survey-btn')).toBeVisible();
  await expect(page.getByRole('link', {name: 'Akun Saya'})).toBeVisible();
});

test('survei tercatat dengan nomor referensi dan tautan WhatsApp', async () => {
  await page.locator('#survey-btn').click();
  await page.locator('dialog [data-yes]').click();
  await expect(page.locator('dialog h2')).toHaveText('Pengajuan tersimpan');
  await expect(page.locator('dialog strong')).toHaveText(/^PGJ-\d{4}-\d{5}$/);
  const link = await page.getByRole('link', {name: 'Lanjut ke WhatsApp'}).getAttribute('href');
  expect(link).toContain('https://wa.me/6281234567890?text=');
  expect(decodeURIComponent(link)).toContain('Siti Uji');
  await page.locator('dialog [data-close]').click();
});

test('KTP diunggah dan menunggu verifikasi', async () => {
  await page.goto('/akun');
  await page.locator('#ktp-file').setInputFiles(PDF);
  await page.locator('#ktp-form button').click();
  await expect(page.getByText('Menunggu verifikasi').first()).toBeVisible();
});

test('kerja sama dibuat dari detail aset', async () => {
  await page.goto(assetPath);
  await page.locator('#coop-btn').click();
  await expect(page.getByRole('heading', {name: 'Permohonan Sewa Baru'})).toBeVisible();
  await expect(page.getByText('Menunggu pengelola menyiapkan surat.')).toBeVisible();
});

test('admin menyiapkan surat, penyewa mengunggah hasil tanda tangan', async () => {
  await loginAdmin(adminPage);
  await adminPage.goto('/admin/pengajuan');
  await expect(adminPage.locator('#app-table tbody tr')).toHaveCount(2);
  await adminPage.locator('#app-table tbody tr', {hasText: 'Permohonan Sewa Baru'}).getByRole('link', {name: 'Kelola'}).click();
  await adminPage.locator('#letter-file').setInputFiles(PDF);
  await adminPage.locator('#letter-form button').click();
  await expect(adminPage.getByText('Versi 1').first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', {name: 'Unduh surat'})).toBeVisible();
  await page.locator('#sign-file').setInputFiles(PDF);
  await page.locator('#sign-form button').click();
  await expect(page.getByText('Menunggu verifikasi').first()).toBeVisible();
});

test('admin tidak bisa menyetujui sebelum KTP terverifikasi', async () => {
  await adminPage.reload();
  await adminPage.locator('#a-status').selectOption('disetujui');
  await adminPage.locator('#app-form button[type=submit]').click();
  await adminPage.locator('dialog [data-yes]').click();
  await expect(adminPage.locator('#toast')).toContainText('KTP harus terverifikasi');
});

test('berkas penyewa tidak dapat dibuka tanpa login', async ({browser}) => {
  const anonymous = await (await browser.newContext()).newPage();
  const response = await anonymous.request.get('/api/my/ktp');
  expect(response.status()).toBe(401);
  const admin = await anonymous.request.get('/api/admin/applications');
  expect(admin.status()).toBe(401);
  await anonymous.context().close();
});
