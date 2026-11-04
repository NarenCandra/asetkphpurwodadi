import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe, expect, it} from 'vitest';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const appJs = read('public/assets/app.js');
const accountJs = read('public/assets/account.js');
const tenantPy = read('tenant.py');

// esc() diambil langsung dari app.js agar tes memakai kode asli.
const escSource = appJs.match(/^const esc = .*$/m)[0];

function load(whatsapp = '6281234567890') {
  const context = vm.createContext({state: {config: {whatsapp}, user: {}}});
  vm.runInContext(escSource, context);
  vm.runInContext(accountJs, context);
  return vm.runInContext('({waLink, dateId, chip, readFile, APP_STATUS, APP_KIND, PAYMENT, DOC_STATUS, TONE})', context);
}

describe('esc (app.js)', () => {
  const context = vm.createContext({});
  vm.runInContext(escSource, context);
  const esc = vm.runInContext('esc', context);
  it('mengamankan karakter HTML', () => {
    expect(esc('<img src=x onerror="a()">')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;');
    expect(esc("O'Brien & Co")).toBe('O&#39;Brien &amp; Co');
  });
  it('null dan undefined menjadi string kosong', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('waLink', () => {
  it('membangun tautan wa.me dengan pesan ter-encode', () => {
    const {waLink} = load();
    const link = waLink('Halo, saya Budi & ingin survei PGJ-2026-00001');
    expect(link.startsWith('https://wa.me/6281234567890?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Halo, saya Budi & ingin survei PGJ-2026-00001');
  });
  it('null bila nomor WhatsApp belum dikonfigurasi', () => {
    expect(load('').waLink('Halo')).toBeNull();
    expect(load(null).waLink('Halo')).toBeNull();
  });
});

describe('dateId', () => {
  it('memformat tanggal ISO ke bahasa Indonesia', () => {
    const {dateId} = load();
    expect(dateId('2026-11-10')).toBe('10 November 2026');
    expect(dateId('2027-01-05')).toBe('5 Januari 2027');
  });
  it('strip untuk nilai kosong', () => {
    expect(load().dateId('')).toBe('-');
    expect(load().dateId(null)).toBe('-');
  });
});

describe('chip', () => {
  it('menampilkan teks ter-escape dengan warna sesuai status', () => {
    const {chip} = load();
    expect(chip('Perlu <perbaikan>', 'perlu_perbaikan')).toBe('<span class="badge overdue">Perlu &lt;perbaikan&gt;</span>');
    expect(chip('Disetujui', 'disetujui')).toBe('<span class="badge ">Disetujui</span>');
  });
});

describe('readFile', () => {
  it('menolak bila belum ada berkas', async () => {
    await expect(load().readFile({files: []})).rejects.toThrow('Pilih berkas');
  });
  it('menolak berkas melebihi batas ukuran', async () => {
    await expect(load().readFile({files: [{size: 6 * 1024 * 1024}]})).rejects.toThrow('maksimal 5 MB');
    await expect(load().readFile({files: [{size: 11 * 1048576}]}, 10 * 1048576)).rejects.toThrow('maksimal 10 MB');
  });
});

describe('kontrak frontend dan backend', () => {
  const backendTuple = name => [...tenantPy.match(new RegExp(`^${name} = \\(([^)]*)\\)`, 'm'))[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);

  it('semua status pengajuan backend punya label dan warna', () => {
    const {APP_STATUS, TONE} = load();
    for (const status of backendTuple('STATUSES')) {
      expect(APP_STATUS[status], `label ${status}`).toBeTruthy();
      expect(TONE, `warna ${status}`).toHaveProperty(status);
    }
  });
  it('semua jenis pengajuan dan status pembayaran backend punya label', () => {
    const {APP_KIND, PAYMENT} = load();
    for (const kind of backendTuple('KINDS')) expect(APP_KIND[kind]).toBeTruthy();
    for (const payment of backendTuple('PAYMENTS')) expect(PAYMENT[payment]).toBeTruthy();
  });
  it('status dokumen backend punya label', () => {
    const {DOC_STATUS} = load();
    for (const status of ['menunggu', 'terverifikasi', 'diterima', 'perlu_perbaikan', 'tersedia']) expect(DOC_STATUS[status]).toBeTruthy();
  });
});
