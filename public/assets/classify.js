// Turunan data untuk filter katalog: kecamatan (dari alamat) dan kategori jenis aset.
(function (root) {
  const CATEGORIES = ['Rumah', 'Lahan', 'Gudang/TPK', 'Kantor/Gedung', 'Lainnya'];
  const title = s => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

  // "Kec. Brati", "Kecamatan Brati", "kec Brati", "Kecamatan: Brati" -> "Brati".
  function kecamatanOf(address) {
    const text = String(address || '').replace(/\s+/g, ' ');
    const m = text.match(/\b(?:kecamatan|kec)\b\.?\s*:?\s*([A-Za-z][A-Za-z' -]*?)(?=\s*(?:[,;()/]|\b(?:kabupaten|kab|desa|ds|dsn|dusun|kelurahan|kel|rt|rw|kota|prov|provinsi)\b|\d|$))/i);
    const name = m?.[1]?.trim();
    return name && name.length >= 3 ? title(name) : '';
  }

  // Kategori eksplisit (diisi admin) menang; selain itu ditebak dari jenis aset dan nama.
  function categoryOf(house) {
    if (house?.category && CATEGORIES.includes(house.category)) return house.category;
    const t = ' ' + String(house?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    if (/ (rumah|rd|rumdin|mess|perumahan|homestay|villa|vila) /.test(t)) return 'Rumah';
    if (/ (tpk|gudang|pgkb|logistik|penimbunan) /.test(t)) return 'Gudang/TPK';
    if (/ (kantor|gedung|ruko|kios|aula|balai) /.test(t)) return 'Kantor/Gedung';
    if (house?.asset_type === 'land' || / (lahan|tanah|kebun|sawah) /.test(t)) return 'Lahan';
    return 'Lainnya';
  }

  const api = {CATEGORIES, kecamatanOf, categoryOf};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Classify = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
