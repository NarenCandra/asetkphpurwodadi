const test = require('node:test'), assert = require('node:assert/strict');
const {kecamatanOf, categoryOf} = require('../public/assets/classify.js');
test('kecamatan dari berbagai format alamat', () => {
  assert.equal(kecamatanOf('Desa Argomulyo, Kec. Brati, Kab. Grobogan'), 'Brati');
  assert.equal(kecamatanOf('Jl. Jati No 1 Kecamatan Purwodadi Kabupaten Grobogan'), 'Purwodadi');
  assert.equal(kecamatanOf('Dsn. X Ds. Y kec Tanggungharjo, Grobogan'), 'Tanggungharjo');
  assert.equal(kecamatanOf('KEC. GETASREJO'), 'Getasrejo');
  assert.equal(kecamatanOf('Kecamatan: Wirosari 58192'), 'Wirosari');
  assert.equal(kecamatanOf('Ds. Danyang Kec Danyang/Grobogan'), 'Danyang');
  assert.equal(kecamatanOf('Kec. Gubug Kab. Grobogan'), 'Gubug');
  assert.equal(kecamatanOf('Jl. Raya Semarang-Purwodadi'), '');
  assert.equal(kecamatanOf(''), '');
});
test('kategori dari nama dan jenis, eksplisit menang', () => {
  assert.equal(categoryOf({name: 'RD Danyang 1', asset_type: 'building'}), 'Rumah');
  assert.equal(categoryOf({name: 'Rumah Dinas Asper', asset_type: 'building'}), 'Rumah');
  assert.equal(categoryOf({name: 'TPK Tjharjo', asset_type: 'building'}), 'Gudang/TPK');
  assert.equal(categoryOf({name: 'Lahan Argomulyo', asset_type: 'land'}), 'Lahan');
  assert.equal(categoryOf({name: 'Argomulyo', asset_type: 'land'}), 'Lahan');
  assert.equal(categoryOf({name: 'Argomulyo', asset_type: 'building'}), 'Lainnya');
  assert.equal(categoryOf({name: 'Argomulyo', asset_type: 'land', category: 'Kantor/Gedung'}), 'Kantor/Gedung');
});
