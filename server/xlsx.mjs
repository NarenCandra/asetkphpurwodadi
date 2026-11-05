import {unzipSync, strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
import {check, sha, hex} from './domain.mjs';

const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const parser = new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',removeNSPrefix:true,parseTagValue:false,trimValues:false});
function xml(raw) {
  check(raw,'Bagian Excel tidak ditemukan.');
  const text = strFromU8(raw);
  check(!/<!DOCTYPE|<!ENTITY/i.test(text),'Berkas Excel tidak aman.');
  return parser.parse(text);
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  if (node.t !== undefined) return list(node.t).map(text).join('');
  if (node['#text'] !== undefined) return String(node['#text']);
  return list(node.r).map(text).join('');
}
function col(ref) {
  const letters = String(ref).match(/^[A-Z]+/)?.[0];
  check(letters,'Alamat sel Excel tidak valid.');
  return [...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
}
export function readXlsx(raw,sheet) {
  let budget = 0, files = 0, entries;
  try {
    entries = unzipSync(raw,{filter:file=>{
      budget += file.originalSize; files++;
      check(budget <= 80*1048576 && files <= 2000,'Berkas Excel terlalu besar.');
      return /^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(file.name);
    }});
  } catch (error) { check(false,error.status ? error.message : 'Berkas bukan file .xlsx yang valid.'); }
  const shared = entries['xl/sharedStrings.xml'] ? list(xml(entries['xl/sharedStrings.xml']).sst.si).map(text) : [];
  const rels = Object.fromEntries(list(xml(entries['xl/_rels/workbook.xml.rels']).Relationships.Relationship).filter(r=>r['@TargetMode'] !== 'External').map(r=>[r['@Id'],r['@Target']]));
  const sheets = list(xml(entries['xl/workbook.xml']).workbook.sheets.sheet).map(s=>({name:s['@name'],target:rels[s['@id']]}));
  check(sheets.length,'Berkas Excel tidak memiliki lembar kerja.');
  const chosen = sheet ? sheets.find(s=>s.name===sheet) : sheets.find(s=>/purwodadi/i.test(s.name) && !/rekap/i.test(s.name)) || sheets[0];
  check(chosen,'Lembar kerja tidak ditemukan.');
  check(typeof chosen.target === 'string','Lembar kerja tidak valid.');
  const path = chosen.target.startsWith('/') ? chosen.target.slice(1) : 'xl/'+chosen.target;
  check(/^xl\/worksheets\/[^/]+\.xml$/.test(path),'Lokasi lembar kerja tidak valid.');
  const rows = list(xml(entries[path]).worksheet.sheetData?.row).map(row=>{
    const cells = {};
    for (const c of list(row.c)) {
      let value;
      if (c['@t'] === 's') value = shared[Number(c.v)];
      else if (c['@t'] === 'inlineStr') value = text(c.is);
      else if (c.v !== undefined) {
        value = text(c.v);
        if (!['str','b','e'].includes(c['@t']) && value.trim() !== '' && Number.isFinite(Number(value))) value = Number(value);
      }
      if (value !== undefined) cells[col(c['@r'])] = value;
    }
    return {row:Number(row['@r']),cells};
  });
  return {sheets:sheets.map(s=>s.name),sheet:chosen.name,rows};
}
const rules = [['objek',['OBJEK']],['inventory_number',['NO. INVENTARIS','NO INVENTARIS']],['lokasi',['LOKASI']],['kondisi',['KONDISI']],['alas_hak',['ALAS HAK']],['bentuk',['BENTUK KERJA SAMA']],['real_2025',['REAL. TAHUN 2025','REAL TAHUN 2025']],['estimasi_2026',['ESTIMASI']],['real_2026',['REAL. TAHUN 2026','REAL TAHUN 2026']],['rencana_2027',['RENCANA']],['keterangan',['KETERANGAN']]];
export function extractRecords(rows) {
  const header = rows.find(r=>Object.values(r.cells).some(v=>typeof v === 'string' && v.trim().toUpperCase().startsWith('OBJEK')));
  check(header,'Baris judul kolom (OBJEK, NO. INVENTARIS, ...) tidak ditemukan.');
  const cols = {};
  for (const [index,value] of Object.entries(header.cells)) if (typeof value === 'string') {
    const normal = value.toUpperCase().trim().replace(/\s+/g,' ');
    const match = rules.find(([key,prefixes])=>!Object.hasOwn(cols,key) && prefixes.some(p=>normal.startsWith(p)));
    if (match) cols[match[0]] = Number(index);
  }
  const records = []; let section = '';
  for (const r of rows) {
    if (r.row <= header.row) continue;
    const first = r.cells[0];
    if (first == null && /JUMLAH/.test(String(r.cells[1] || '').toUpperCase())) break;
    if (first === 1 && r.cells[1] === 2 && r.cells[2] === 3) continue;
    if (typeof first === 'number' && Object.values(cols).some(i=>r.cells[i] != null && r.cells[i] !== '')) {
      const rec = {row:r.row,no:Math.trunc(first),section};
      for (const [key,index] of Object.entries(cols)) rec[key] = typeof r.cells[index] === 'string' ? r.cells[index].trim() : r.cells[index] ?? null;
      records.push(rec);
    } else if (first == null && typeof r.cells[1] === 'string' && r.cells[1].trim()) section = r.cells[1].trim();
  }
  return records;
}
function amount(value) {
  if (typeof value === 'number' && value >= 0) return Math.trunc(value);
  if (typeof value === 'string' && /^(?:\d{1,3}(?:\.\d{3})+|\d+)$/.test(value.trim())) return Number(value.replace(/\./g,''));
  return null;
}
// Match Python json.dumps for the legacy import fingerprint, preserving deduplication.
const pyJson = value => '['+value.map(v=>JSON.stringify(v).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))).join(', ')+']';
export function recordToHouse(rec,code) {
  const raw = String(rec.bentuk || '').trim(), low = raw.toLowerCase();
  const coop = low.startsWith('sewa') && low.includes('1') ? 'Sewa 1 tahun' : low.startsWith('sharing') ? 'Sharing' : low.startsWith('franchise') ? 'Franchise' : '';
  const notes = [`Diimpor dari Excel baris ${rec.row}${rec.section ? ` (${rec.section})` : ''}.`];
  let name = String(rec.objek || '').trim();
  if (!name) { name = `Aset KPH Purwodadi No. ${rec.no}`; notes.push('Nama objek, lokasi, atau No. Inventaris belum ada di Excel: lengkapi sebelum publikasi.'); }
  if (raw && !coop) notes.push(`Bentuk kerja sama pada Excel: ${raw}.`);
  const values = Object.fromEntries(['real_2025','estimasi_2026','real_2026','rencana_2027'].map(k=>[k,amount(rec[k])]));
  const yearly = coop === 'Sewa 1 tahun' && values.estimasi_2026 ? {price:values.estimasi_2026,minimum:1} : null;
  if (yearly) notes.push('Harga sewa tahunan diisi dari Estimasi 2026 pada Excel; sesuaikan bila perlu.');
  for (const key of Object.keys(values)) if (values[key] === null && rec[key] != null && rec[key] !== '') notes.push(`${key} pada Excel: ${rec[key]}.`);
  const condition = String(rec.kondisi || '').trim();
  return {asset_type:'building',name,code,description:'',area:'',address:String(rec.lokasi || '').trim(),maps_url:'',terms:'',extra_costs:'',internal_notes:notes.join(' '),lease_period:'',lease_start:'',lease_end:'',access:'',land_condition:'',inventory_number:String(rec.inventory_number || '').trim(),asset_condition:condition.charAt(0).toUpperCase()+condition.slice(1),legal_basis:String(rec.alas_hak || '').trim(),cooperation_type:coop,land_size:0,building_size:0,bedrooms:0,bathrooms:0,amenities:[],monthly:null,yearly,status:'Draft',keterangan:String(rec.keterangan ?? '').trim(),...values,import_key:sha(pyJson([...rules.map(([k])=>k).sort().map(k=>rec[k] ?? null),rec.row])).slice(0,24)};
}
export async function importExcel(c,body) {
  check(typeof body.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(body.data),'Pilih berkas .xlsx.');
  const raw = Buffer.from(body.data,'base64');
  check(raw.length > 0 && raw.length <= 3*1048576,'Pilih berkas .xlsx (maksimal 3 MB).');
  const {sheets,sheet,rows} = readXlsx(raw,body.sheet || null), records = extractRecords(rows);
  const existing = await c.q('SELECT id,code,body FROM houses');
  const byKey = new Map(); let seq = 0;
  for (const r of existing) {
    const b = JSON.parse(r.body);
    if (b.import_key) byKey.set(b.import_key,{id:r.id,body:b});
    const m = r.code.match(/^PWD-(\d+)$/i);
    if (m) seq = Math.max(seq,Number(m[1]));
  }
  const result = {sheets,sheet,found:records.length,new:0,skipped:0,published_new:0,published_existing:0,priced_existing:0,committed:body.commit===true,preview:[]};
  for (const rec of records) {
    const house = recordToHouse(rec,`PWD-${String(seq+1).padStart(3,'0')}`);
    const eligible = body.publish === true && (!house.keterangan || /^(proses|belum)/i.test(house.keterangan));
    const previous = byKey.get(house.import_key);
    if (previous) {
      result.skipped++;
      const old = previous.body; let changed = false;
      if (String(old.internal_notes || '').startsWith('Diimpor dari Excel')) {
        if (result.committed && house.yearly && old.yearly == null) { old.yearly = house.yearly; old.internal_notes += ' Harga sewa tahunan diisi dari Estimasi 2026 pada Excel; sesuaikan bila perlu.'; result.priced_existing++; changed = true; }
        if (eligible && old.status === 'Draft') { result.published_existing++; if (result.committed) { old.status = 'Tersedia'; changed = true; } }
      }
      if (changed && previous.id) await c.q('UPDATE houses SET body=$1,revision=revision+1 WHERE id=$2',[JSON.stringify(old),previous.id]);
      continue;
    }
    seq++; result.new++;
    byKey.set(house.import_key,{id:null,body:house});
    if (eligible) { house.status = 'Tersedia'; result.published_new++; }
    if (result.preview.length < 8) result.preview.push(Object.fromEntries(['code','name','address','inventory_number','asset_condition','cooperation_type','real_2025','estimasi_2026','real_2026','keterangan','status'].map(k=>[k,house[k]])));
    if (result.committed) await c.q('INSERT INTO houses(id,code,body) VALUES($1,$2,$3)',[hex(),house.code,JSON.stringify(house)]);
  }
  return result;
}
