// Konversi Excel bebas-format ke template impor aset. Modul murni (tanpa I/O) agar mudah diuji.
import {sha} from './domain.mjs';

export const TEMPLATE = [
  ['nama', 'Nama Aset'], ['jenis', 'Jenis Aset'], ['alamat', 'Lokasi/Alamat'], ['deskripsi', 'Deskripsi'],
  ['harga', 'Harga Sewa per Tahun'], ['minimum', 'Minimum Lama Sewa'], ['luas_bangunan', 'Luas Bangunan (m²)'],
  ['luas_tanah', 'Luas Tanah (m²)'], ['status', 'Status Ketersediaan'], ['foto', 'Foto'], ['fasilitas', 'Fasilitas'],
  ['kondisi', 'Kondisi Aset'], ['peruntukan', 'Rekomendasi Peruntukan'], ['inventaris', 'Nomor Inventaris'],
  ['kerjasama', 'Bentuk Kerja Sama'],
];
const KEYS = TEMPLATE.map(([k]) => k);
export const TEMPLATE_KEYS = KEYS;
export const labelOf = key => TEMPLATE.find(([k]) => k === key)?.[1] ?? 'Luas Aset';

// 'luas_umum' = kolom luas tunggal (format lama); dibagi ke bangunan/tanah menurut jenis aset.
const ALIASES = {
  nama: ['nama aset', 'uraian nama aset', 'uraian', 'objek', 'nama objek', 'nama properti', 'nama'],
  jenis: ['jenis aset', 'tipe aset', 'kategori aset', 'jenis', 'tipe', 'kategori'],
  alamat: ['lokasi alamat', 'lokasi', 'alamat', 'letak'],
  deskripsi: ['deskripsi', 'tentang aset', 'uraian singkat'],
  harga: ['harga sewa per tahun', 'harga per tahun', 'harga th', 'harga tahun', 'harga sewa', 'tarif sewa', 'harga'],
  minimum: ['minimum lama sewa', 'minimal lama sewa', 'minimum sewa', 'minimal sewa', 'lama sewa minimum', 'lama sewa'],
  luas_bangunan: ['luas bangunan', 'luas aset bangunan', 'bangunan'],
  luas_tanah: ['luas tanah', 'luas lahan', 'luas aset tanah', 'tanah'],
  luas_umum: ['luas aset', 'luas'],
  status: ['status ketersediaan', 'ketersediaan', 'status'],
  foto: ['foto', 'gambar', 'photo'],
  fasilitas: ['fasilitas aset', 'fasilitas'],
  kondisi: ['kondisi aset', 'kondisi'],
  peruntukan: ['rekomendasi peruntukan', 'rekomentasi peruntukan', 'peruntukan', 'rekomendasi'],
  inventaris: ['nomor inventaris', 'no inventaris', 'nomor inv', 'kode inventaris'],
  kerjasama: ['bentuk kerja sama', 'bentuk kerjasama', 'jenis kerja sama', 'kerja sama', 'kerjasama', 'skema'],
};

export const norm = s => String(s ?? '').toLowerCase().replace(/²/g, '2').replace(/[^a-z0-9]+/g, ' ').replace(/\bm2\b/g, ' ').replace(/\s+/g, ' ').trim();

function distance(a, b) {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Cocokkan satu judul kolom ke kunci template (atau null).
export function matchHeader(text) {
  const n = norm(text);
  if (!n || n === 'no' || n === 'nomor') return null;
  for (const [key, aliases] of Object.entries(ALIASES)) if (aliases.includes(n)) return key;
  for (const [key, aliases] of Object.entries(ALIASES)) if (aliases.some(a => a.length >= 6 && n.startsWith(a + ' '))) return key;
  let best = null;
  for (const [key, aliases] of Object.entries(ALIASES)) for (const a of aliases) {
    if (a.length < 7) continue;
    const d = distance(n, a);
    if (d <= Math.max(1, Math.floor(a.length / 8)) && (!best || d < best.d)) best = {key, d};
  }
  return best?.key ?? null;
}

const isText = v => typeof v === 'string' && v.trim() !== '';

// Susun judul kolom; mendukung judul dua baris (sel atas digabung, mis. "Luas (m²)" di atas "Bangunan"/"Tanah").
function headerAt(rows, i) {
  const top = rows[i].cells, next = rows[i + 1]?.cells;
  const hasSub = next && typeof next[0] !== 'number' && Object.values(next).some(isText) && !Object.values(next).some(v => typeof v === 'number' && v > 3);
  const cols = new Set([...Object.keys(top), ...(hasSub ? Object.keys(next) : [])].map(Number));
  const labels = {}; let carry = '', carryAt = -2;
  for (const c of [...cols].sort((a, b) => a - b)) {
    let t = isText(top[c]) ? top[c].trim() : '';
    if (t) { carry = t; carryAt = c; } else if (hasSub && isText(next[c]) && carryAt === c - 1) { t = carry; carryAt = c; }
    const s = hasSub && isText(next[c]) ? next[c].trim() : '';
    const label = [t, s].filter(Boolean).join(' ');
    if (label) labels[c] = label;
  }
  return {labels, dataFrom: i + (hasSub ? 2 : 1)};
}

export function detectHeader(rows) {
  let best = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const {labels, dataFrom} = headerAt(rows, i), found = new Set();
    for (const label of Object.values(labels)) { const k = matchHeader(label); if (k) found.add(k); }
    if (!best || found.size > best.score) best = {index: i, labels, dataFrom, score: found.size, row: rows[i].row};
  }
  if (!best || best.score < 3) {
    // Tidak dikenali oleh aturan: pakai baris dengan teks terbanyak, pemetaan diserahkan ke AI.
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const {labels, dataFrom} = headerAt(rows, i), n = Object.keys(labels).length;
      if (n >= 3 && (!best || best.score >= 3 || n > Object.keys(best.labels).length)) best = {index: i, labels, dataFrom, score: best?.score ?? 0, row: rows[i].row};
    }
  }
  return best && Object.keys(best.labels).length >= 3 ? best : null;
}

// Hasil: {mapping:[{col,header,key,by}], unmapped:[{col,header}]}
export function mapColumns(labels, aiMap = {}) {
  const used = new Set(), mapping = [], unmapped = [];
  for (const [col, header] of Object.entries(labels)) {
    let key = matchHeader(header), by = 'aturan';
    if (!key && aiMap[header] && (KEYS.includes(aiMap[header]) || aiMap[header] === 'luas_umum')) { key = aiMap[header]; by = 'AI'; }
    if (key && !used.has(key)) { used.add(key); mapping.push({col: Number(col), header, key, by}); }
    else unmapped.push({col: Number(col), header});
  }
  return {mapping, unmapped};
}

// Baris penomoran kolom pada format formulir pemerintah: 1, 2, 3, ... di bawah judul. Bukan data.
export function isNumbering(cells) {
  const v = Object.values(cells).filter(x => x !== '' && x != null);
  return v.length >= 3 && v.every(x => typeof x === 'number' || /^\d+$/.test(String(x).trim())) && v.map(Number).sort((a, b) => a - b).every((x, i) => x === i + 1);
}

// Ambil baris data (nilai mentah per kunci template). Sel kosong tetap kosong.
export function extractRows(rows, header, mapping, noCol = null) {
  const out = [];
  for (const r of rows.slice(header.dataFrom)) {
    if (r.row <= header.row || isNumbering(r.cells)) continue;
    const rec = {_row: r.row};
    const no = noCol == null ? null : r.cells[noCol];
    rec._no = typeof no === 'number' ? no : /^\d+/.test(String(no ?? '')) ? Number(String(no).match(/^\d+/)[0]) : '';
    let any = false;
    for (const {col, key} of mapping) {
      const v = r.cells[col];
      rec[key] = typeof v === 'string' ? v.trim() : v ?? '';
      if (rec[key] !== '') any = true;
    }
    if (/^jumlah|^total/i.test(String(rec.nama ?? rec.alamat ?? '')) ) break;
    if (any) out.push(rec);
  }
  return out;
}

export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  let s = String(v ?? '').toLowerCase().replace(/rp\.?|m2|m²|\/\s*(th|tahun)|per tahun|\s/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function minimumYears(v) {
  if (v === '' || v == null) return 1;
  const n = parseNumber(typeof v === 'string' ? v.replace(/tahun|thn|th|bulan|bln/gi, '') : v);
  if (!n) return 1;
  return /bulan|bln/i.test(String(v)) ? Math.max(1, Math.ceil(n / 12)) : Math.max(1, Math.ceil(n));
}

const text = (v, max = 10000) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '').trim().slice(0, max);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function cleanRecord(r) {
  const out = {_row: Number.isInteger(r?._row) ? r._row : 0, _no: typeof r?._no === 'number' && Number.isFinite(r._no) ? r._no : ''};
  for (const k of [...KEYS, 'luas_umum']) {
    const v = r?.[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? v.slice(0, 5000) : '';
  }
  return out;
}

// Bangun isi aset (bentuk sama dengan hasil impor lama) dari satu baris template.
export function buildHouse(rec, code, {publish = false} = {}) {
  const notes = [`Diimpor dari Excel (template) baris ${rec._row || '?'}.`];
  const warn = m => notes.push(m);
  let name = text(rec.nama, 200);
  if (!name) { name = `Aset tanpa nama (baris ${rec._row || '?'})`; warn('Nama aset kosong di Excel: lengkapi sebelum publikasi.'); }
  const jenisText = norm(rec.jenis);
  let bangunan = rec.luas_bangunan === '' ? null : parseNumber(rec.luas_bangunan);
  let tanah = rec.luas_tanah === '' ? null : parseNumber(rec.luas_tanah);
  const umum = rec.luas_umum === '' || rec.luas_umum == null ? null : parseNumber(rec.luas_umum);
  for (const [k, raw, val] of [['luas bangunan', rec.luas_bangunan, bangunan], ['luas tanah', rec.luas_tanah, tanah], ['luas', rec.luas_umum, umum]]) if (raw !== '' && raw != null && val === null) warn(`Nilai ${k} tidak terbaca: ${text(raw, 50)}.`);
  let type = /tanah|lahan|kosong/.test(jenisText) ? 'land' : /bangun|rumah|gedung|kantor|ruko|gudang|villa|vila|homestay|kios/.test(jenisText) ? 'building' : null;
  if (!type) { type = tanah > 0 && !(bangunan > 0) ? 'land' : 'building'; if (jenisText) warn(`Jenis aset tidak dikenali (${text(rec.jenis, 50)}): diset ${type === 'land' ? 'Tanah' : 'Bangunan'}.`); }
  if (umum != null) { if (type === 'land' && tanah == null) tanah = umum; else if (bangunan == null) bangunan = umum; }
  if (type === 'land') bangunan = 0;
  const harga = rec.harga === '' ? null : parseNumber(rec.harga);
  if (rec.harga !== '' && harga === null) warn(`Harga tidak terbaca: ${text(rec.harga, 50)}.`);
  const yearly = harga && harga > 0 ? {price: Math.round(harga), minimum: minimumYears(rec.minimum)} : null;
  const kerja = norm(rec.kerjasama);
  const coop = /sewa/.test(kerja) ? 'Sewa 1 tahun' : /sharing/.test(kerja) ? 'Sharing' : /franchise|waralaba/.test(kerja) ? 'Franchise' : '';
  if (kerja && !coop) warn(`Bentuk kerja sama pada Excel: ${text(rec.kerjasama, 80)}.`);
  const st = norm(rec.status);
  const available = st && !/tidak/.test(st) && (/belum (di)?sewa/.test(st) || (!/tersewa|disewa|dipesan|booking/.test(st) && /tersedia|ready|available|\bada\b|kosong/.test(st)));
  if (st && !available) warn(`Status pada Excel: ${text(rec.status, 50)} (disimpan sebagai Draft).`);
  if (rec.foto !== '' && rec.foto != null) warn(`Foto pada Excel: ${text(rec.foto, 200)} (foto belum diimpor otomatis; unggah dari halaman aset).`);
  const amenities = text(rec.fasilitas, 5000).split(/[\n;•]+|,(?![^(]*\))/).map(x => x.replace(/^[-*\s]+/, '').trim().slice(0, 150)).filter(Boolean).slice(0, 50);
  const key = sha(['tpl', norm(name), norm(rec.alamat), norm(rec.inventaris)].join('|')).slice(0, 24);
  return {
    asset_type: type, name, code, description: text(rec.deskripsi), area: '', address: text(rec.alamat, 1000), maps_url: '', terms: '', extra_costs: '',
    internal_notes: notes.join(' '), lease_period: '', lease_start: '', lease_end: '', access: '', land_condition: '',
    inventory_number: text(rec.inventaris, 200), asset_condition: cap(text(rec.kondisi, 200)), legal_basis: '', cooperation_type: coop,
    recommended_use: text(rec.peruntukan, 2000), category: '', land_size: tanah ?? 0, building_size: bangunan ?? 0, bedrooms: 0, bathrooms: 0, amenities,
    monthly: null, yearly, status: publish && available ? 'Tersedia' : 'Draft', keterangan: '',
    real_2025: null, estimasi_2026: null, real_2026: null, rencana_2027: null, import_key: key,
  };
}
