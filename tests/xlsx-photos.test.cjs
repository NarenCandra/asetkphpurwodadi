const test = require('node:test'), assert = require('node:assert/strict');
const X = require('../public/assets/xlsx-photos.js');
test('zip ringan dapat dibaca kembali', () => {
  const zip = X.read(X.buildZip([['xl/workbook.xml', new TextEncoder().encode('<workbook/>')], ['xl/worksheets/sheet1.xml', new TextEncoder().encode('<x/>')]]).buffer);
  assert.deepEqual([...zip.entries.keys()], ['xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
});
test('lembar foto dicocokkan lewat nomor, nama, atau kolom Foto', () => {
  const recs = [{_no: 1, nama: 'Argomulyo', alamat: '', foto: ''}, {_no: 2, nama: 'TPK Tjharjo', alamat: '', foto: ''}, {_no: 3, nama: 'Rumah Dinas Danyang 1', alamat: '', foto: 'galeri danyang'}];
  const m = X.matchSheets([{name: '1. argomulyo'}, {name: '2. tpk tjharjo'}, {name: 'galeri danyang'}, {name: 'lain-lain'}], recs);
  assert.deepEqual(m.map(x => x.index), [0, 1, 2, -1]);
  assert.equal(m[2].by, 'kolom Foto');
});
