import {check, hex, token, sha, equal, passwordHash, now, cleanWhatsapp, readUpload, contentType, iso, today, HttpError} from './domain.mjs';
import {json, storage} from './api.mjs';
import {importExcel} from './xlsx.mjs';

const userJson = u => ({id:u.uid ?? u.id,name:u.name,email:u.email,whatsapp:u.whatsapp});
const docJson = (d, admin) => d ? ({id:d.id,kind:d.kind,version:d.version,status:d.status,reason:d.reason,name:d.original_name,created:d.created,application_id:d.application_id,url:`/api/${admin ? 'admin' : 'my'}/documents/${d.id}/file`}) : null;
const latest = (c,uid,kind,aid=null) => c.one('SELECT * FROM documents WHERE user_id=$1 AND kind=$2 AND application_id IS NOT DISTINCT FROM $3 ORDER BY version DESC LIMIT 1',[uid,kind,aid]);
async function houseBrief(c,id) {
  const row = await c.one('SELECT id,body FROM houses WHERE id=$1',[id]);
  if (!row) return null;
  const b = JSON.parse(row.body);
  return {id:row.id,code:b.code,name:b.name,status:b.status,area:b.area,monthly:b.monthly,yearly:b.yearly};
}
async function startSession(c,u,status=200) {
  const value = token(), csrf = token();
  await c.q('INSERT INTO user_sessions VALUES($1,$2,$3,$4)',[sha(value),csrf,Math.floor(Date.now()/1000)+28800,u.id]);
  return json({authenticated:true,csrf,user:userJson(u)},status,c.cookie('usession',value));
}
async function addDocument(c,uid,aid,kind,body) {
  const {raw,extension,name} = readUpload(body);
  const row = await c.one('SELECT COALESCE(MAX(version),0)+1 AS version FROM documents WHERE user_id=$1 AND application_id IS NOT DISTINCT FROM $2 AND kind=$3',[uid,aid,kind]);
  const id = hex(16), filename = `${uid}/${id}.${extension}`;
  await storage('POST','tenant-docs',filename,raw,contentType(extension));
  c.uploaded.push(['tenant-docs',filename]);
  await c.q('INSERT INTO documents(id,user_id,application_id,kind,filename,original_name,version,status,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,uid,aid,kind,filename,name,row.version,kind==='surat_siap_ttd' ? 'tersedia' : 'menunggu',now()]);
  return id;
}
async function progress(c,a,documents=null) {
  if (['ditolak','dibatalkan'].includes(a.status)) return [0,a.status === 'dibatalkan' ? 'Pengajuan ditutup.' : 'Pengajuan ditolak. Lihat catatan pengelola.'];
  if (a.kind === 'survei') return [{diproses:2,terjadwal:3,selesai:3}[a.status] || 2, {diproses:'Lanjutkan ke WhatsApp dengan nomor referensi untuk menyepakati jadwal survei.',terjadwal:'Survei sudah dijadwalkan pengelola. Jika setelah survei Anda sepakat, lanjutkan ke permohonan sewa.',selesai:'Survei selesai. Jika sepakat, lanjutkan ke permohonan sewa.'}[a.status] || ''];
  if (a.applied) return [4,'Sewa aktif. Lihat periode di Sewa Saya.'];
  if (['disetujui','selesai'].includes(a.status)) return [3,a.payment === 'lunas' ? 'Pengajuan selesai dan pelunasan dikonfirmasi. Menunggu pengelola mencatat periode sewa.' : a.payment === 'dp' ? 'DP dikonfirmasi. Lanjutkan pelunasan melalui WhatsApp.' : 'Disetujui. Lanjutkan ke WhatsApp untuk pembayaran.'];
  const ktp = a.ktp_doc_id ? (documents ? documents.find(d=>d.id===a.ktp_doc_id) : await c.one('SELECT * FROM documents WHERE id=$1',[a.ktp_doc_id])) : null;
  if (ktp?.status === 'perlu_perbaikan') return [1,'Perbaiki KTP: '+(ktp.reason || 'lihat catatan pengelola')+'.'];
  if (a.status === 'perlu_perbaikan') return [1,'Perbaiki berkas: '+(a.admin_note || 'lihat catatan pengelola')+'.'];
  const template = documents ? documents.filter(d=>d.application_id===a.id && d.kind==='surat_siap_ttd').sort((x,y)=>y.version-x.version)[0] : await latest(c,a.user_id,'surat_siap_ttd',a.id);
  if (!template) return [1,'Menunggu pengelola menyiapkan surat siap tanda tangan.'];
  const signed = documents ? documents.filter(d=>d.application_id===a.id && d.kind==='surat_ttd').sort((x,y)=>y.version-x.version)[0] : await latest(c,a.user_id,'surat_ttd',a.id);
  if (!signed) return [1,'Unduh surat, tandatangani di luar website, lalu unggah hasilnya.'];
  if (signed.status === 'perlu_perbaikan') return [1,'Perbaiki surat: '+(signed.reason || 'lihat catatan pengelola')+'.'];
  return [2,'Berkas lengkap. Menunggu verifikasi pengelola.'];
}
async function appJson(c,a,admin=false,detail=false,related=null) {
  const data = Object.fromEntries(['id','ref','kind','status','payment','closed','applied','created','updated','lease_id','admin_note','payment_note'].map(k=>[k,a[k]]));
  data.house = related ? related.house : await houseBrief(c,a.house_id);
  [data.step,data.next] = await progress(c,a,related?.documents);
  if (admin) data.tenant = related ? related.tenant : await c.one('SELECT name,email,whatsapp FROM users WHERE id=$1',[a.user_id]);
  if (detail) {
    data.documents = (await c.q('SELECT * FROM documents WHERE application_id=$1 ORDER BY kind,version',[a.id])).map(d=>docJson(d,admin));
    data.ktp = docJson(a.ktp_doc_id ? await c.one('SELECT * FROM documents WHERE id=$1',[a.ktp_doc_id]) : null,admin);
    if (admin) data.ktp_versions = (await c.q("SELECT * FROM documents WHERE user_id=$1 AND kind='ktp' ORDER BY version",[a.user_id])).map(d=>docJson(d,true));
    if (a.lease_id) data.lease_periods = await c.q('SELECT period,start_date AS start,end_date AS end FROM lease_periods WHERE lease_id=$1 ORDER BY start_date',[a.lease_id]);
  }
  return data;
}
async function createApplication(c,u,body) {
  const kind = body.kind;
  check(['survei','sewa_baru','perpanjangan'].includes(kind),'Jenis pengajuan tidak valid.');
  let lease = null;
  if (kind === 'perpanjangan') {
    lease = await c.one('SELECT * FROM leases WHERE id=$1 AND user_id=$2',[body.lease_id,u.uid]);
    check(lease,'Sewa tidak ditemukan.');
  }
  const house = await houseBrief(c,lease?.house_id ?? body.house_id ?? '');
  check(house,'Aset tidak ditemukan.');
  check(kind === 'perpanjangan' || house.status === 'Tersedia','Aset ini tidak sedang tersedia untuk diajukan.');
  const existing = await c.one('SELECT * FROM applications WHERE user_id=$1 AND house_id=$2 AND kind=$3 AND '+(kind==='survei' ? "status IN ('diproses','terjadwal')" : 'closed=0'),[u.uid,house.id,kind]);
  if (existing) return json({...await appJson(c,existing),existing:true});
  let ktp = null;
  if (kind !== 'survei') {
    if (kind === 'sewa_baru') check(await c.one("SELECT 1 FROM applications WHERE user_id=$1 AND house_id=$2 AND kind='survei' AND status NOT IN ('ditolak','dibatalkan')",[u.uid,house.id]),'Ajukan dan lakukan survei terlebih dahulu sebelum mengajukan kerja sama.');
    ktp = await latest(c,u.uid,'ktp');
    check(ktp && ktp.status !== 'perlu_perbaikan','Unggah KTP yang jelas terlebih dahulu di Dokumen Saya.');
  }
  const year = today().slice(0,4);
  // All write requests hold a database advisory lock, including ref allocation.
  const row = await c.one('SELECT COUNT(*)::int AS count FROM applications WHERE ref LIKE $1',[`PGJ-${year}-%`]);
  let n = row.count+1, ref;
  do { ref = `PGJ-${year}-${String(n++).padStart(5,'0')}`; } while (await c.one('SELECT 1 FROM applications WHERE ref=$1',[ref]));
  const id = hex();
  const a = await c.one('INSERT INTO applications(id,ref,kind,user_id,house_id,lease_id,ktp_doc_id,created,updated) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *',[id,ref,kind,u.uid,house.id,lease?.id ?? null,ktp?.id ?? null,now()]);
  return json({...await appJson(c,a),existing:false},201);
}
async function leaseJson(c,l) {
  const periods = await c.q('SELECT period,start_date AS start,end_date AS end FROM lease_periods WHERE lease_id=$1 ORDER BY start_date,end_date',[l.id]);
  return {id:l.id,house:await houseBrief(c,l.house_id),periods,current:periods.at(-1) ?? null,open_renewal:!!await c.one("SELECT 1 FROM applications WHERE lease_id=$1 AND kind='perpanjangan' AND closed=0",[l.id])};
}
async function tenantJson(c,u,detail=false) {
  const ktp = await latest(c,u.id,'ktp');
  const counts = await c.one('SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE closed=0)::int AS open FROM applications WHERE user_id=$1',[u.id]);
  const data = {...userJson(u),created:u.created,ktp:docJson(ktp,true),applications:counts.total,open:counts.open};
  if (detail) {
    data.ktp_versions = (await c.q("SELECT * FROM documents WHERE user_id=$1 AND kind='ktp' ORDER BY version DESC",[u.id])).map(d=>docJson(d,true));
    data.application_list = [];
    for (const a of await c.q('SELECT * FROM applications WHERE user_id=$1 ORDER BY created DESC',[u.id])) data.application_list.push(await appJson(c,a,true));
    data.leases = [];
    for (const l of await c.q('SELECT * FROM leases WHERE user_id=$1 ORDER BY created DESC',[u.id])) data.leases.push(await leaseJson(c,l));
  }
  return data;
}
async function adminUpdate(c,a,body) {
  const status = body.status ?? a.status, payment = body.payment ?? a.payment, note = body.admin_note ?? a.admin_note, pnote = body.payment_note ?? a.payment_note;
  check(['diproses','terjadwal','selesai','perlu_perbaikan','disetujui','ditolak','dibatalkan'].includes(status) && ['belum','dp','lunas'].includes(payment) && typeof note === 'string' && typeof pnote === 'string' && note.length <= 2000 && pnote.length <= 2000,'Data pengajuan tidak valid.');
  check(!a.applied,'Pengajuan ini sudah diaktifkan menjadi sewa dan tidak dapat diubah.');
  check(a.kind === 'survei' ? !['perlu_perbaikan','disetujui'].includes(status) && payment === 'belum' : status !== 'terjadwal','Status tidak sesuai dengan jenis pengajuan.');
  check(a.kind === 'survei' || status !== 'selesai' || payment === 'lunas','Status Selesai memerlukan pelunasan yang dikonfirmasi.');
  check(status !== 'perlu_perbaikan' || note.trim(),'Tuliskan alasan perbaikan pada catatan admin.');
  if (a.kind !== 'survei' && ['disetujui','selesai'].includes(status) && !['disetujui','selesai'].includes(a.status)) {
    const ktp = await c.one('SELECT * FROM documents WHERE id=$1',[a.ktp_doc_id]);
    check(ktp?.status === 'terverifikasi','KTP harus terverifikasi sebelum pengajuan disetujui.');
    check((await latest(c,a.user_id,'surat_ttd',a.id))?.status === 'diterima','Surat bertanda tangan harus berstatus Diterima sebelum pengajuan disetujui.');
  }
  check(payment === 'belum' || ['disetujui','selesai'].includes(status),'Pembayaran hanya dapat dikonfirmasi setelah pengajuan disetujui.');
  if (a.kind === 'sewa_baru' && payment !== 'belum' && payment !== a.payment) check(!await c.one("SELECT 1 FROM applications WHERE house_id=$1 AND id!=$2 AND kind='sewa_baru' AND closed=0 AND payment IN ('dp','lunas')",[a.house_id,a.id]),'Aset ini sudah ditahan oleh pengajuan lain.');
  const finalStatus = a.kind !== 'survei' && payment === 'lunas' ? 'selesai' : status;
  await c.q('UPDATE applications SET status=$1,admin_note=$2,payment=$3,payment_note=$4,closed=$5,updated=$6 WHERE id=$7',[finalStatus,note.trim(),payment,pnote.trim(),['ditolak','dibatalkan'].includes(status)?1:0,now(),a.id]);
  return json({ok:true});
}
async function activate(c,a,body,extend=false) {
  check(a.kind === (extend?'perpanjangan':'sewa_baru') && ['disetujui','selesai'].includes(a.status) && a.payment === 'lunas' && !a.closed && !a.applied,'Sewa hanya dapat dicatat dari pengajuan yang disetujui dan pelunasannya sudah dikonfirmasi.');
  check(body.confirm === true,'Konfirmasi aktivasi atau perpanjangan diperlukan.');
  const house = await houseBrief(c,a.house_id);
  let last = null;
  if (extend) {
    check(a.lease_id,'Sewa tidak ditemukan.');
    last = await c.one('SELECT * FROM lease_periods WHERE lease_id=$1 ORDER BY end_date DESC LIMIT 1',[a.lease_id]);
    check(last,'Periode sewa tidak ditemukan.');
  }
  const period = body.period ?? last?.period, end = iso(body.end,'Tanggal akhir');
  const following = last ? new Date(Date.parse(last.end_date)+86400000).toISOString().slice(0,10) : null;
  const start = iso(body.start || following,'Tanggal mulai');
  check(['monthly','yearly'].includes(period) && (extend || house?.[period]),'Pilih periode yang ditawarkan aset ini.');
  check(end >= start && (!last || end > last.end_date),'Tanggal akhir baru tidak valid.');
  check(extend || house.status === 'Dipesan','Ubah status aset menjadi Dipesan (setelah DP) sebelum mengaktifkan sewa.');
  const lid = extend ? a.lease_id : hex();
  if (!extend) await c.q('INSERT INTO leases VALUES($1,$2,$3,$4,$5)',[lid,a.house_id,a.user_id,a.id,now()]);
  await c.q('INSERT INTO lease_periods VALUES($1,$2,$3,$4,$5,$6,$7)',[hex(),lid,a.id,period,start,end,now()]);
  if (!extend || house.status === 'Tersewa') {
    const row = await c.one('SELECT body FROM houses WHERE id=$1 FOR UPDATE',[a.house_id]);
    const b = JSON.parse(row.body);
    Object.assign(b,{lease_period:period,lease_end:end},extend ? {} : {status:'Tersewa',lease_start:start});
    await c.q('UPDATE houses SET body=$1,revision=revision+1 WHERE id=$2',[JSON.stringify(b),a.house_id]);
  }
  await c.q('UPDATE applications SET lease_id=$1,closed=1,applied=1,updated=$2 WHERE id=$3',[lid,now(),a.id]);
  return json({ok:true,...(!extend ? {lease_id:lid} : {})});
}

async function myRoute(c,u) {
  const {path,method} = c, uid = u.uid;
  if (path === '/api/my/profile' && method === 'PUT') {
    const b = await c.body(20000);
    check(typeof b.name === 'string' && b.name.trim().length >= 2 && b.name.trim().length <= 100,'Nama wajib diisi (2-100 karakter).');
    const wa = cleanWhatsapp(b.whatsapp);
    await c.q('UPDATE users SET name=$1,whatsapp=$2 WHERE id=$3',[b.name.trim(),wa,uid]);
    return json({authenticated:true,csrf:u.csrf,user:{...userJson(u),name:b.name.trim(),whatsapp:wa}});
  }
  if (path === '/api/my/ktp') {
    if (method === 'GET') {
      const versions = (await c.q("SELECT * FROM documents WHERE user_id=$1 AND kind='ktp' ORDER BY version DESC",[uid])).map(d=>docJson(d,false));
      return json({latest:versions[0] ?? null,versions});
    }
    if (method === 'POST') {
      const id = await addDocument(c,uid,null,'ktp',await c.body());
      await c.q("UPDATE applications SET ktp_doc_id=$1,updated=$2 WHERE user_id=$3 AND kind!='survei' AND closed=0 AND applied=0 AND status IN ('diproses','perlu_perbaikan')",[id,now(),uid]);
      return json({ok:true,id},201);
    }
  }
  if (path === '/api/my/applications') {
    if (method === 'POST') return createApplication(c,u,await c.body(20000));
    if (method === 'GET') {
      const result = [];
      for (const a of await c.q('SELECT * FROM applications WHERE user_id=$1 ORDER BY created DESC',[uid])) result.push(await appJson(c,a));
      return json(result);
    }
  }
  if (path === '/api/my/leases' && method === 'GET') {
    const result = [];
    for (const l of await c.q('SELECT * FROM leases WHERE user_id=$1 ORDER BY created DESC',[uid])) result.push(await leaseJson(c,l));
    return json(result);
  }
  let m = path.match(/^\/api\/my\/documents\/([a-f0-9]+)\/file$/);
  if (m && method === 'GET') {
    const d = await c.one('SELECT * FROM documents WHERE id=$1 AND user_id=$2',[m[1],uid]);
    check(d,'Berkas tidak tersedia.',404);
    return c.file(d);
  }
  m = path.match(/^\/api\/my\/applications\/([a-f0-9]+)(\/documents|\/cancel)?$/);
  if (m) {
    const a = await c.one('SELECT * FROM applications WHERE id=$1 AND user_id=$2',[m[1],uid]);
    check(a,'Pengajuan tidak ditemukan.',404);
    if (!m[2] && method === 'GET') return json(await appJson(c,a,false,true));
    if (m[2] === '/cancel' && method === 'POST') {
      await c.body(20000);
      check(!a.applied && !a.closed && a.payment === 'belum','Pengajuan ini tidak dapat dibatalkan dari akun Anda. Hubungi pengelola.');
      await c.q("UPDATE applications SET status='dibatalkan',closed=1,updated=$1 WHERE id=$2",[now(),a.id]);
      return json({ok:true});
    }
    if (m[2] === '/documents' && method === 'POST') {
      check(a.kind !== 'survei' && !a.closed,'Pengajuan ini tidak menerima berkas.');
      check(await latest(c,uid,'surat_siap_ttd',a.id),'Surat siap tanda tangan belum disediakan pengelola.');
      const id = await addDocument(c,uid,a.id,'surat_ttd',await c.body());
      if (a.status === 'perlu_perbaikan') await c.q("UPDATE applications SET status='diproses',updated=$1 WHERE id=$2",[now(),a.id]);
      return json({ok:true,id},201);
    }
  }
  m = path.match(/^\/api\/my\/leases\/([a-f0-9]+)\/renew$/);
  if (m && method === 'POST') { await c.body(20000); return createApplication(c,u,{kind:'perpanjangan',lease_id:m[1]}); }
  throw new HttpError(404,'Tidak ditemukan.');
}

async function adminRoute(c) {
  const {path,method} = c;
  if (path === '/api/admin/tenants' && method === 'GET') {
    const text = '%'+(c.url.searchParams.get('q') || '').trim()+'%';
    const result = [];
    const rows = await c.q(`SELECT u.id,u.name,u.email,u.whatsapp,u.created,
      (SELECT row_to_json(d) FROM documents d WHERE d.user_id=u.id AND d.kind='ktp' AND d.application_id IS NULL ORDER BY d.version DESC LIMIT 1) AS ktp,
      (SELECT COUNT(*)::int FROM applications a WHERE a.user_id=u.id) AS applications,
      (SELECT COUNT(*)::int FROM applications a WHERE a.user_id=u.id AND a.closed=0) AS open
      FROM users u WHERE u.name ILIKE $1 OR u.email ILIKE $1 OR u.whatsapp LIKE $1 ORDER BY u.created DESC LIMIT 500`,[text]);
    for (const row of rows) result.push({...row,ktp:docJson(row.ktp,true)});
    return json(result);
  }
  let m = path.match(/^\/api\/admin\/tenants\/([a-f0-9]+)$/);
  if (m && method === 'GET') {
    const u = await c.one('SELECT id,name,email,whatsapp,created FROM users WHERE id=$1',[m[1]]);
    check(u,'Penyewa tidak ditemukan.',404);
    return json(await tenantJson(c,u,true));
  }
  if (path === '/api/admin/import' && method === 'POST') return json(await importExcel(c,await c.body()));
  if (path === '/api/admin/applications' && method === 'GET') {
    const args = [], conditions = [];
    for (const key of ['kind','status','payment']) if (c.url.searchParams.get(key)) { args.push(c.url.searchParams.get(key)); conditions.push(`a.${key}=$${args.length}`); }
    if (c.url.searchParams.get('q')?.trim()) { args.push('%'+c.url.searchParams.get('q').trim()+'%'); conditions.push(`(a.ref ILIKE $${args.length} OR u.name ILIKE $${args.length} OR u.email ILIKE $${args.length})`); }
    const result = [];
    const rows = await c.q('SELECT a.*,h.body AS house_body,u.name AS tenant_name,u.email AS tenant_email,u.whatsapp AS tenant_whatsapp FROM applications a JOIN users u ON u.id=a.user_id LEFT JOIN houses h ON h.id=a.house_id'+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY a.created DESC LIMIT 500',args);
    const documents = rows.length ? await c.q("SELECT * FROM documents WHERE application_id=ANY($1::text[]) OR (user_id=ANY($2::text[]) AND kind='ktp' AND application_id IS NULL) OR id=ANY($3::text[])",[rows.map(a=>a.id),[...new Set(rows.map(a=>a.user_id))],rows.map(a=>a.ktp_doc_id).filter(Boolean)]) : [];
    for (const a of rows) {
      const body = a.house_body ? JSON.parse(a.house_body) : null;
      const house = body ? Object.fromEntries(['code','name','status','area','monthly','yearly'].map(k=>[k,body[k]])) : null;
      if (house) house.id = a.house_id;
      const related = {house,tenant:{name:a.tenant_name,email:a.tenant_email,whatsapp:a.tenant_whatsapp},documents};
      const item = await appJson(c,a,true,false,related);
      const ktp = documents.filter(d=>d.user_id===a.user_id && d.kind==='ktp' && d.application_id===null).sort((x,y)=>y.version-x.version)[0];
      item.ktp_status = ktp?.status ?? null;
      item.pending_documents = documents.filter(d=>d.status==='menunggu' && (d.application_id===a.id || d.id===ktp?.id)).length;
      result.push(item);
    }
    return json(result);
  }
  m = path.match(/^\/api\/admin\/documents\/([a-f0-9]+)(\/file)?$/);
  if (m) {
    const d = await c.one('SELECT * FROM documents WHERE id=$1',[m[1]]);
    check(d,'Berkas tidak ditemukan.',404);
    if (m[2] && method === 'GET') return c.file(d);
    if (!m[2] && method === 'PUT') {
      const b = await c.body(20000), allowed = {ktp:['menunggu','terverifikasi','perlu_perbaikan'],surat_ttd:['menunggu','diterima','perlu_perbaikan']};
      check(allowed[d.kind]?.includes(b.status),'Status berkas tidak valid.');
      const reason = String(b.reason ?? '').trim().slice(0,1000);
      check(b.status !== 'perlu_perbaikan' || reason,'Tuliskan alasan perbaikan.');
      await c.q('UPDATE documents SET status=$1,reason=$2 WHERE id=$3',[b.status,b.status==='perlu_perbaikan'?reason:'',d.id]);
      return json({ok:true});
    }
  }
  m = path.match(/^\/api\/admin\/applications\/([a-f0-9]+)(\/documents|\/activate|\/extend)?$/);
  if (m) {
    const a = await c.one('SELECT * FROM applications WHERE id=$1',[m[1]]);
    check(a,'Pengajuan tidak ditemukan.',404);
    if (!m[2] && method === 'GET') return json(await appJson(c,a,true,true));
    if (!m[2] && method === 'PUT') return adminUpdate(c,a,await c.body(20000));
    if (m[2] === '/documents' && method === 'POST') {
      check(a.kind !== 'survei' && !a.closed,'Pengajuan ini tidak memerlukan surat.');
      const id = await addDocument(c,a.user_id,a.id,'surat_siap_ttd',await c.body());
      return json({ok:true,id},201);
    }
    if (['/activate','/extend'].includes(m[2]) && method === 'POST') return activate(c,a,await c.body(20000),m[2]==='/extend');
  }
  throw new HttpError(404,'Tidak ditemukan.');
}

export async function tenantRoute(c) {
  const {path,method} = c;
  if (path === '/api/me' && method === 'GET') {
    const u = await c.user(false);
    return json({authenticated:!!u,csrf:u?.csrf ?? null,user:u?userJson(u):null});
  }
  if (path === '/api/register' && method === 'POST') {
    const b = await c.body(20000);
    check(['name','email','password'].every(k=>typeof b[k] === 'string'),'Isian pendaftaran tidak valid.');
    const name = b.name.trim(), email = b.email.trim().toLowerCase();
    check(name.length >= 2 && name.length <= 100,'Nama wajib diisi (2-100 karakter).');
    check(/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email),'Email tidak valid.');
    check(b.password.length >= 8 && b.password.length <= 200,'Kata sandi minimal 8 karakter.');
    const wa = cleanWhatsapp(b.whatsapp), salt = hex(16), id = hex();
    check(!await c.one('SELECT 1 FROM users WHERE lower(email)=$1',[email]),'Email sudah terdaftar. Silakan masuk.');
    await c.q('INSERT INTO users VALUES($1,$2,$3,$4,$5,$6,$7)',[id,email,name,wa,salt,await passwordHash(b.password,salt),now()]);
    return startSession(c,{id,name,email,whatsapp:wa},201);
  }
  if (path === '/api/user/login' && method === 'POST') {
    const b = await c.body(20000);
    check(typeof b.email === 'string' && typeof b.password === 'string' && b.password.length <= 200,'Isian login tidak valid.');
    const u = await c.one('SELECT * FROM users WHERE lower(email)=lower($1)',[b.email.trim()]);
    const computed = await passwordHash(b.password,u?.salt || '00'.repeat(16));
    check(u && equal(computed,u.password_hash),'Email atau kata sandi salah.',401);
    return startSession(c,u);
  }
  if (path === '/api/user/logout' && method === 'POST') {
    const u = await c.user();
    await c.q('DELETE FROM user_sessions WHERE token_hash=$1',[u.token_hash]);
    return json({ok:true},200,c.cookie('usession','',0));
  }
  if (path.startsWith('/api/my/')) return myRoute(c,await c.user());
  if (path.startsWith('/api/admin/')) { await c.admin(); return adminRoute(c); }
  throw new HttpError(404,'Tidak ditemukan.');
}
