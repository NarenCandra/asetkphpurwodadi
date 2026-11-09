// Membaca .xlsx di browser tanpa library: foto per lembar kerja + salinan ringan (tanpa gambar) untuk dikonversi server.
(function (root) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function listEntries(bytes) {
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('Berkas bukan .xlsx yang valid.');
    const count = u16(bytes, end + 10);
    let p = u32(bytes, end + 16);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      if (u32(bytes, p) !== 0x02014b50) throw new Error('Berkas .xlsx rusak.');
      const method = u16(bytes, p + 10), csize = u32(bytes, p + 20), usize = u32(bytes, p + 24);
      const nlen = u16(bytes, p + 28), elen = u16(bytes, p + 30), clen = u16(bytes, p + 32), offset = u32(bytes, p + 42);
      entries.set(dec.decode(bytes.subarray(p + 46, p + 46 + nlen)), {method, csize, usize, offset});
      p += 46 + nlen + elen + clen;
    }
    return entries;
  }

  const attrs = tag => { const out = {}; for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2]; return out; };
  const unxml = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+);/g, (m, e) => ({lt: '<', gt: '>', amp: '&', quot: '"', apos: "'"}[e] ?? String.fromCharCode(Number(e.slice(1)))));
  const rel = (v, k) => v[k] ?? v[Object.keys(v).find(x => x.endsWith(':' + k.split(':').pop()))];
  const baseDir = path => path.slice(0, path.lastIndexOf('/') + 1);
  function resolve(base, target) {
    const parts = (target.startsWith('/') ? target.slice(1) : baseDir(base) + target).split('/'), out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
    return out.join('/');
  }
  const relsOf = xml => Object.fromEntries([...xml.matchAll(/<Relationship\b[^>]*>/g)].map(m => attrs(m[0])).map(a => [a.Id, a.Target]));

  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = data => { let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  // Zip tanpa kompresi (stored); cukup untuk XML kecil.
  function buildZip(files) {
    const parts = [], central = []; let offset = 0;
    for (const [name, data] of files) {
      const nm = enc.encode(name), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nm.length, true);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, nm.length, true); cen.setUint32(42, offset, true);
      parts.push(new Uint8Array(local.buffer), nm, data); central.push(new Uint8Array(cen.buffer), nm);
      offset += 30 + nm.length + data.length;
    }
    const cdSize = central.reduce((n, a) => n + a.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true); eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(eocd.buffer)], out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  function toBase64(bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function read(buffer) {
    const bytes = new Uint8Array(buffer), entries = listEntries(bytes);
    const get = async name => {
      const e = entries.get(name); if (!e) return null;
      const start = e.offset + 30 + u16(bytes, e.offset + 26) + u16(bytes, e.offset + 28);
      const raw = bytes.subarray(start, start + e.csize);
      return e.method === 0 ? raw : e.method === 8 ? inflate(raw) : null;
    };
    const text = async name => { const d = await get(name); return d ? dec.decode(d) : null; };

    async function sheetList() {
      const wb = await text('xl/workbook.xml'), rels = relsOf(await text('xl/_rels/workbook.xml.rels') || '');
      check(wb, 'xl/workbook.xml tidak ada.');
      return [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => attrs(m[0])).map(a => ({name: unxml(a.name), path: resolve('xl/workbook.xml', rels[rel(a, 'r:id')] || '')}));
    }
    function check(ok, msg) { if (!ok) throw new Error(msg); }

    // Daftar gambar (melayang di atas lembar) per lembar, urut dari kiri-atas.
    async function sheetMedia(sheet) {
      const relPath = baseDir(sheet.path) + '_rels/' + sheet.path.split('/').pop() + '.rels', rx = await text(relPath);
      if (!rx) return [];
      const out = [];
      for (const m of rx.matchAll(/<Relationship\b[^>]*>/g)) {
        const a = attrs(m[0]); if (!/\/drawing$/.test(a.Type || '')) continue;
        const dPath = resolve(sheet.path, a.Target), dx = await text(dPath);
        if (!dx) continue;
        const drels = relsOf(await text(baseDir(dPath) + '_rels/' + dPath.split('/').pop() + '.rels') || '');
        for (const anchor of dx.matchAll(/<(?:\w+:)?(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g)) {
          const blip = anchor[0].match(/<(?:\w+:)?blip\b[^>]*>/); if (!blip) continue;
          const embed = rel(attrs(blip[0]), 'r:embed'); if (!embed || !drels[embed]) continue;
          const from = anchor[0].match(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?col>(\d+)<[\s\S]*?<(?:\w+:)?row>(\d+)</);
          out.push({path: resolve(dPath, drels[embed]), col: from ? Number(from[1]) : 0, row: from ? Number(from[2]) : 0});
        }
      }
      const seen = new Set();
      return out.sort((x, y) => x.row - y.row || x.col - y.col).filter(i => !seen.has(i.path + i.col + i.row) && seen.add(i.path + i.col + i.row));
    }

    return {
      entries,
      file: get,
      sheetList,
      sheetMedia,
      // Lembar yang berisi gambar: [{name, count}]
      async photoSheets() {
        const out = [];
        for (const s of await sheetList()) { const media = await sheetMedia(s); if (media.length) out.push({name: s.name, count: media.length}); }
        return out;
      },
      // Byte gambar asli sebuah lembar: [{path, bytes}]
      async sheetImages(name) {
        const sheet = (await sheetList()).find(s => s.name === name);
        const out = [];
        for (const m of sheet ? await sheetMedia(sheet) : []) { const bytes = await get(m.path); if (bytes) out.push({path: m.path, bytes}); }
        return out;
      },
      // Salinan ringan tanpa gambar (base64) supaya muat di batas unggah server.
      async liteBase64() {
        const files = [];
        for (const name of entries.keys()) {
          if (name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' || name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet[^/]*\.xml$/.test(name)) files.push([name, await get(name)]);
        }
        check(files.some(f => f[0] === 'xl/workbook.xml'), 'Berkas .xlsx tidak lengkap.');
        return toBase64(buildZip(files));
      },
    };
  }

  const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const STOP = new Set(['rumah', 'dinas', 'tpk', 'rd', 'aset', 'lahan', 'tanah', 'kph', 'pwd', 'no']);

  // Cocokkan nama lembar foto ke baris data. Mengembalikan [{sheet, index, by}] (index -1 = tidak cocok).
  // Prioritas: isi kolom Foto = nama lembar; angka di depan nama lembar = kolom No.; kemiripan nama.
  function matchSheets(sheets, records) {
    const used = new Set(), result = [];
    const tokens = s => norm(s).split(' ').filter(t => t && !/^\d+$/.test(t));
    const sig = s => tokens(s).filter(t => !STOP.has(t));
    for (const sheet of sheets) {
      const name = sheet.name, prefix = name.match(/^\s*(\d+)\s*[.)\-_ ]/), rest = name.replace(/^\s*\d+\s*[.)\-_ ]\s*/, '');
      const words = sig(rest).length ? sig(rest) : tokens(rest);
      const nameScore = r => { const rw = new Set(tokens(`${r.nama} ${r.alamat}`)); return words.length ? words.filter(w => rw.has(w) || [...rw].some(x => x.length > 4 && w.length > 4 && (x.includes(w) || w.includes(x)))).length / words.length : 0; };
      let index = records.findIndex((r, i) => !used.has(i) && r.foto && norm(r.foto) === norm(name)), by = 'kolom Foto';
      if (index < 0 && prefix) {
        const n = Number(prefix[1]);
        const byNo = records.findIndex((r, i) => !used.has(i) && Number(r._no) === n);
        if (byNo >= 0) { index = byNo; by = nameScore(records[byNo]) > 0 ? 'nomor dan nama' : 'nomor'; }
      }
      if (index < 0) {
        let best = 0; records.forEach((r, i) => { const s = used.has(i) ? 0 : nameScore(r); if (s > best) { best = s; index = i; } });
        by = best >= 0.5 ? 'nama' : ''; if (best < 0.5) index = -1;
      }
      if (index >= 0) used.add(index); else by = '';
      result.push({sheet: name, index, by});
    }
    return result;
  }

  // Khusus browser: kecilkan gambar ke JPEG (sisi terpanjang maksimal maxSide) lalu base64.
  async function toJpegBase64(bytes, {maxSide = 1600, quality = 0.82} = {}) {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((ok, no) => canvas.toBlob(b => b ? ok(b) : no(new Error('Gagal memproses gambar.')), 'image/jpeg', quality));
    return toBase64(new Uint8Array(await blob.arrayBuffer()));
  }

  // Isi template Word: setiap {{PENANDA}} di word/document.xml diganti nilainya (sudah di-escape XML).
  const xmlEscape = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  async function fillDocx(buffer, values) {
    const zip = read(buffer), files = [];
    for (const name of zip.entries.keys()) {
      if (name.endsWith('/')) continue;
      let data = await zip.file(name);
      if (!data) continue;
      if (name === 'word/document.xml') data = enc.encode(dec.decode(data).replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => key in values ? xmlEscape(values[key]) : m));
      files.push([name, data]);
    }
    return buildZip(files);
  }

  const api = {read, matchSheets, toJpegBase64, buildZip, crc32, fillDocx};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XlsxPhotos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
