import test from 'node:test';
import assert from 'node:assert/strict';
import {detectHeader, mapColumns, extractRows, buildHouse, matchHeader, parseNumber} from '../server/convert.mjs';

const R = (row, cells) => ({row, cells});
// Format baru milik pengguna: judul dua baris, "Luas (m²)" digabung, typo "Rekomentasi" dan "Fasikitas", kolom kosong.
const rows = [
  R(1, {0:'No',1:'Uraian/Nama Aset',2:'Tentang Aset',3:'Lokasi',4:'Luas (m²)',6:'Rekomentasi Peruntukan',7:'Harga / Th',8:'Titik Koordinat',9:'Foto',10:'Fasikitas'}),
  R(2, {4:'Bangunan',5:'Tanah'}),
  R(3, {0:1,1:'Rumah Dinas A',2:'Rumah tipe 36',3:'Jl. Jati No. 1',4:60,5:'1.200,5',6:'Homestay',7:'Rp 12.000.000',8:'-7.1,110.9',9:'Rumah Dinas A',10:'AC, Wifi (kencang, cepat), Parkir'}),
  R(4, {0:2,1:'Lahan B',3:'Desa X',5:300,7:'5.000.000'}),
  R(5, {1:'JUMLAH'}),
];
test('header dua baris dan typo dikenali', () => {
  const h = detectHeader(rows); assert.ok(h.score >= 6); assert.equal(h.dataFrom, 2);
  const {mapping, unmapped} = mapColumns(h.labels);
  const by = Object.fromEntries(mapping.map(m => [m.key, m.col]));
  assert.deepEqual([by.nama, by.deskripsi, by.alamat, by.luas_bangunan, by.luas_tanah, by.peruntukan, by.harga, by.foto, by.fasilitas], [1,2,3,4,5,6,7,9,10]);
  assert.deepEqual(unmapped.map(u => u.header), ['No', 'Titik Koordinat']);
});
test('baris diubah ke template, sel kosong dibiarkan', () => {
  const h = detectHeader(rows), {mapping} = mapColumns(h.labels), recs = extractRows(rows, h, mapping);
  assert.equal(recs.length, 2);
  const a = buildHouse(recs[0], 'PWD-001'), b = buildHouse(recs[1], 'PWD-002');
  assert.equal(a.asset_type, 'building'); assert.equal(a.building_size, 60); assert.equal(a.land_size, 1200.5);
  assert.deepEqual(a.yearly, {price: 12000000, minimum: 1}); assert.equal(a.recommended_use, 'Homestay');
  assert.deepEqual(a.amenities, ['AC', 'Wifi (kencang, cepat)', 'Parkir']); assert.equal(a.status, 'Draft');
  assert.equal(b.asset_type, 'land'); assert.equal(b.building_size, 0); assert.equal(b.land_size, 300); assert.equal(b.description, '');
});
test('status tersedia hanya tayang bila publish dicentang', () => {
  const rec = {nama:'X', status:'Tersedia'};
  assert.equal(buildHouse(rec, 'PWD-001').status, 'Draft');
  assert.equal(buildHouse(rec, 'PWD-001', {publish:true}).status, 'Tersedia');
  assert.equal(buildHouse({nama:'X', status:'Tidak tersedia'}, 'PWD-001', {publish:true}).status, 'Draft');
  assert.equal(buildHouse({nama:'X', status:'Belum disewa'}, 'PWD-001', {publish:true}).status, 'Tersedia');
});
test('angka dan kunci impor stabil', () => {
  assert.equal(parseNumber('1.250.000'), 1250000); assert.equal(parseNumber('Rp 2.000.000/th'), 2000000); assert.equal(parseNumber('abc'), null);
  assert.equal(buildHouse({nama:'A', alamat:'B'}, 'PWD-001').import_key, buildHouse({nama:' a ', alamat:'b'}, 'PWD-009').import_key);
  assert.equal(matchHeader('Bentuk Kerja Sama'), 'kerjasama'); assert.equal(matchHeader('Kolom Aneh'), null);
  assert.equal(buildHouse({nama:'A', minimum:'18 bulan', harga:'1000'}, 'P').yearly.minimum, 2);
});

test('nomor urut (_no) ikut terbawa untuk pencocokan foto', () => {
  const h = detectHeader(rows), {mapping} = mapColumns(h.labels), recs = extractRows(rows, h, mapping, 0);
  assert.deepEqual(recs.map(r => r._no), [1, 2]);
});

test('baris penomoran kolom (1..n) bukan data', async () => {
  const {isNumbering} = await import('../server/convert.mjs');
  assert.equal(isNumbering({0:1,1:2,2:3,3:4}), true);
  assert.equal(isNumbering({0:'1',1:'2',3:'3'}), true);
  assert.equal(isNumbering({0:1,1:'Rumah',2:3}), false);
  assert.equal(isNumbering({0:1,1:2}), false);
});
