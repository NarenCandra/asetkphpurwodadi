// Impor Excel bebas-format: konversi ke template (aturan + AI untuk kolom tak dikenal), pratinjau, lalu simpan.
import {check, hex} from './domain.mjs';
import {readXlsx} from './xlsx.mjs';
import {aiMapping} from './aimap.mjs';
import {norm, isNumbering, TEMPLATE, labelOf, detectHeader, mapColumns, extractRows, buildHouse, cleanRecord} from './convert.mjs';

const MAX_ROWS = 500;

async function loadSheet(raw, wanted) {
  const first = readXlsx(raw, wanted || null);
  const names = wanted ? [wanted] : first.sheets;
  let best = null;
  for (const name of names.slice(0, 20)) {
    const data = name === first.sheet ? first : readXlsx(raw, name);
    const header = detectHeader(data.rows);
    if (header && (!best || header.score > best.header.score)) best = {data, header};
  }
  check(best, 'Baris judul kolom tidak ditemukan pada lembar mana pun. Gunakan template atau pilih lembar yang benar.');
  return best;
}

export async function convertUpload(c, body) {
  check(typeof body.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(body.data), 'Pilih berkas .xlsx.');
  const raw = Buffer.from(body.data, 'base64');
  check(raw.length > 0 && raw.length <= 3 * 1048576, 'Pilih berkas .xlsx (maksimal 3 MB).');
  const {data, header} = await loadSheet(raw, typeof body.sheet === 'string' && body.sheet.trim() ? body.sheet.trim() : null);
  let {mapping, unmapped} = mapColumns(header.labels);
  const ai = await aiMapping(unmapped, data.rows.slice(header.dataFrom).filter(r => !isNumbering(r.cells)));
  if (Object.keys(ai.map).length) ({mapping, unmapped} = mapColumns(header.labels, ai.map));
  check(mapping.some(m => m.key === 'nama'), 'Kolom nama aset tidak ditemukan. Pastikan ada kolom "Nama Aset".');
  const noCol = Object.entries(header.labels).find(([, l]) => ['no', 'nomor', 'no urut'].includes(norm(l)))?.[0];
  const records = extractRows(data.rows, header, mapping, noCol === undefined ? null : Number(noCol));
  check(records.length, `Tidak ada baris berisi data pada lembar "${data.sheet}" (hanya judul atau nomor kolom). Isi datanya, atau ketik nama lembar lain di kolom "Lembar kerja".`);
  check(records.length <= MAX_ROWS, `Maksimal ${MAX_ROWS} baris per impor.`);
  const existing = await c.q('SELECT body FROM houses');
  const known = new Set(existing.map(r => JSON.parse(r.body).import_key).filter(Boolean));
  const preview = records.map((r, i) => buildHouse(r, `PWD-${String(i + 1).padStart(3, '0')}`));
  const seen = new Set(), duplicates = preview.map(h => { const dup = known.has(h.import_key) || seen.has(h.import_key); seen.add(h.import_key); return dup; });
  return {
    sheet: data.sheet, sheets: data.sheets, ai_used: ai.used, ai_note: ai.error || null,
    mapping: mapping.map(m => ({header: m.header, key: m.key, label: m.key === 'luas_umum' ? 'Luas Aset' : labelOf(m.key), by: m.by})),
    ignored: unmapped.map(u => u.header),
    missing: TEMPLATE.filter(([k]) => !mapping.some(m => m.key === k)).map(([, l]) => l),
    found: records.length, duplicates: duplicates.filter(Boolean).length,
    rows: preview.slice(0, 15).map((h, i) => ({name: h.name, type: h.asset_type, address: h.address, yearly: h.yearly, land_size: h.land_size, building_size: h.building_size, status: h.status, duplicate: duplicates[i], notes: h.internal_notes.replace(/^Diimpor dari Excel \(template\) baris \d+\.\s*/, '')})),
    records,
  };
}

export async function applyRecords(c, body) {
  check(Array.isArray(body.records) && body.records.length > 0 && body.records.length <= MAX_ROWS, `Kirim 1-${MAX_ROWS} baris.`);
  const existing = await c.q('SELECT id,code,body FROM houses');
  const counts = new Map((await c.q('SELECT house_id,COUNT(*)::int AS n FROM photos GROUP BY house_id')).map(r => [r.house_id, r.n]));
  const known = new Map(); let seq = 0;
  for (const r of existing) {
    const b = JSON.parse(r.body); if (b.import_key) known.set(b.import_key, r.id);
    const m = r.code.match(/^PWD-(\d+)$/i); if (m) seq = Math.max(seq, Number(m[1]));
  }
  let added = 0, skipped = 0; const houses = [];
  for (const [i, input] of body.records.entries()) {
    const house = buildHouse(cleanRecord(input), `PWD-${String(seq + 1).padStart(3, '0')}`, {publish: body.publish === true});
    if (known.has(house.import_key)) { skipped++; const id = known.get(house.import_key); houses.push({i, id, photos: counts.get(id) ?? 0}); continue; }
    const id = hex(); known.set(house.import_key, id); seq++; added++;
    await c.q('INSERT INTO houses(id,code,body) VALUES($1,$2,$3)', [id, house.code, JSON.stringify(house)]);
    houses.push({i, id, photos: 0});
  }
  return {ok: true, added, skipped, houses};
}
