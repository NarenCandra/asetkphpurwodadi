import {randomBytes, scrypt as nodeScrypt, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';

const scrypt = promisify(nodeScrypt);
export const hex = (bytes = 12) => randomBytes(bytes).toString('hex');
export const token = () => randomBytes(32).toString('base64url');
export const sha = value => createHash('sha256').update(value).digest('hex');
export const now = () => new Date().toISOString();
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function check(ok, message, status = 400) { if (!ok) throw new HttpError(status, message); }
export function equal(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function passwordHash(password, salt) {
  return (await scrypt(password, Buffer.from(salt, 'hex'), 64, {N: 16384, r: 8, p: 1, maxmem: 64 * 1048576})).toString('hex');
}
export const internalKeys = ['lease_period','lease_start','lease_end','internal_notes','inventory_number','asset_condition','legal_basis','cooperation_type','real_2025','estimasi_2026','real_2026','rencana_2027','keterangan','import_key'];
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: process.env.TIMEZONE || 'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function iso(value, label = 'Tanggal') {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, `${label} tidak valid.`);
  return value;
}
export function cleanWhatsapp(value) {
  let wa = String(value ?? '').replace(/[\s+\-]/g, '');
  if (wa.startsWith('0')) wa = '62' + wa.slice(1);
  check(/^62\d{8,13}$/.test(wa), 'Nomor WhatsApp tidak valid. Contoh: 0812xxxxxxx.');
  return wa;
}
export function leaseNotice(house) {
  if (house.status !== 'Tersewa' || !house.lease_end) return null;
  const days = (Date.parse(house.lease_end) - Date.parse(today())) / 86400000;
  return days < 0 ? 'Perlu ditinjau' : days <= (house.lease_period === 'monthly' ? 7 : 30) ? 'Segera berakhir' : null;
}
export function validateHouse(body, previous = null) {
  const result = {asset_type: body.asset_type ?? previous?.asset_type ?? 'building'};
  check(['building','land'].includes(result.asset_type), 'Jenis aset tidak valid.');
  for (const key of ['name','code','description','area','address','maps_url','terms','extra_costs','internal_notes','lease_period','lease_start','lease_end','access','land_condition','inventory_number','asset_condition','legal_basis','cooperation_type','keterangan']) {
    const value = body[key] ?? '';
    check(typeof value === 'string' && value.length <= 10000, 'Isian teks tidak valid: ' + key);
    result[key] = value.trim();
  }
  check(result.name && result.code, 'Nama dan kode rumah wajib diisi.');
  check(['','Sewa 1 tahun','Sharing','Franchise'].includes(result.cooperation_type), 'Bentuk kerja tidak valid.');
  if (result.maps_url) {
    let url;
    try { url = new URL(result.maps_url); } catch { /* rejected below */ }
    check(url?.protocol === 'https:' && ['maps.google.com','www.google.com','google.com','maps.app.goo.gl','goo.gl'].includes(url.hostname), 'Gunakan tautan Google Maps HTTPS.');
  }
  for (const key of ['real_2025','estimasi_2026','real_2026','rencana_2027']) {
    const value = body[key] ?? previous?.[key] ?? null;
    check(value === null || value === '' || (Number.isInteger(value) && value >= 0 && value <= 1e12), 'Nilai rupiah tidak valid: ' + key);
    result[key] = value === '' ? null : value;
  }
  for (const key of ['land_size','building_size','bedrooms','bathrooms']) {
    const value = body[key] ?? 0;
    check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e8 && (!['bedrooms','bathrooms'].includes(key) || Number.isInteger(value)), 'Spesifikasi tidak valid: ' + key);
    result[key] = value;
  }
  if (result.asset_type === 'land') Object.assign(result, {building_size:0, bedrooms:0, bathrooms:0});
  const amenities = body.amenities ?? [];
  check(Array.isArray(amenities) && amenities.length <= 50 && amenities.every(x => typeof x === 'string' && x.length <= 150), 'Daftar fasilitas tidak valid.');
  result.amenities = amenities.map(x => x.trim()).filter(Boolean);
  for (const period of ['monthly','yearly']) {
    const price = body[period] ?? null;
    check(price === null || (typeof price === 'object' && [price.price, price.minimum].every(x => Number.isInteger(x) && x > 0 && x <= 1e12)), 'Harga dan minimum sewa harus bilangan bulat positif.');
    result[period] = price === null ? null : {price:price.price, minimum:price.minimum};
  }
  const transitions = {Draft:['Tersedia'], Tersedia:['Dipesan','Draft'], Dipesan:['Tersedia','Tersewa','Draft'], Tersewa:['Tersedia','Draft']};
  result.status = body.status ?? 'Draft';
  check(Object.hasOwn(transitions, result.status), 'Status tidak valid.');
  const old = previous?.status ?? 'Draft';
  if (result.status !== old) {
    check(transitions[old]?.includes(result.status), 'Transisi status tidak diizinkan.');
    check(body.confirm_status === true, 'Konfirmasi perubahan status diperlukan.');
  }
  if (result.status === 'Tersewa') {
    check(['monthly','yearly'].includes(result.lease_period) && result[result.lease_period], 'Pilih periode aktif yang ditawarkan rumah.');
    check(iso(result.lease_end) >= iso(result.lease_start), 'Tanggal akhir tidak boleh sebelum tanggal mulai.');
  }
  if (previous?.demo) result.demo = true;
  if (previous?.import_key) result.import_key = previous.import_key;
  return result;
}
export const uploadLimit = 3 * 1048576;
export function readUpload(body, photo = false) {
  check(typeof body.data === 'string' && body.data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(body.data), 'Data berkas tidak valid.');
  const raw = Buffer.from(body.data, 'base64');
  check(raw.toString('base64') === body.data, 'Data berkas tidak valid.');
  const extension = raw.subarray(0,3).equals(Buffer.from([255,216,255])) ? 'jpg'
    : raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : photo && raw.subarray(0,4).toString() === 'RIFF' && raw.subarray(8,12).toString() === 'WEBP' ? 'webp'
    : !photo && raw.subarray(0,5).toString() === '%PDF-' ? 'pdf' : null;
  check(extension && raw.length > 0 && raw.length <= uploadLimit, `Gunakan ${photo ? 'JPEG, PNG, atau WebP' : 'PDF, JPG, atau PNG'} maksimal 3 MB.`);
  return {raw, extension, name:String(body.name ?? 'berkas').replace(/[^\p{L}\p{N}_.\- ]/gu, '').trim().slice(0,100) || 'berkas'};
}
export const contentType = extension => ({pdf:'application/pdf',jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[extension] || 'application/octet-stream');
