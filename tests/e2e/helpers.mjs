export const ADMIN = {
  user: process.env.E2E_ADMIN_USER || 'e2e-admin',
  password: process.env.E2E_ADMIN_PASSWORD || 'e2e-password-123456',
};
export const PDF = {name: 'berkas-uji.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% berkas uji\n')};

export async function loginAdmin(page) {
  await page.goto('/admin');
  await page.locator('#username').fill(ADMIN.user);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', {name: 'Masuk'}).click();
  await page.locator('.stats').waitFor();
}

export const firstAsset = page => page.locator('a[href^="/rumah/"]').first();
