import {databasePool} from './database.mjs';
import {HttpError, check, equal, token, hex, sha, passwordHash, internalKeys, leaseNotice, validateHouse, cleanWhatsapp, readUpload, contentType, now} from './domain.mjs';
import {tenantRoute} from './tenant.mjs';
import {storageKey} from './storage-config.mjs';

const responseHeaders = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY'};
export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {status, headers:{...responseHeaders, 'Content-Type':'application/json; charset=utf-8', ...extra}});
export function publicConfig() {
  const e = process.env, number = e.WHATSAPP_NUMBER || '';
  return {name:e.BUSINESS_NAME || 'Sewa Aset Perhutani KPH Purwodadi', profile:e.BUSINESS_PROFILE || 'Katalog bangunan dan tanah kosong KPH Purwodadi.', areas:e.SERVICE_AREAS || 'KPH Purwodadi', hours:e.SERVICE_HOURS || 'Hubungi pengelola untuk jam layanan.', whatsapp:/^[1-9]\d{7,14}$/.test(number) ? number : null, whatsapp_display:e.WHATSAPP_DISPLAY || 'Nomor pengelola belum dikonfigurasi.', timezone:e.TIMEZONE || 'Asia/Jakarta'};
}

export async function storage(method, bucket, filename, raw, type) {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = storageKey();
  check(base && key, 'Konfigurasi penyimpanan Supabase belum lengkap di Netlify.', 503);
  check(new URL(base).protocol === 'https:', 'Konfigurasi Supabase tidak valid.', 503);
  check(!filename.split('/').some(p => !p || p === '..' || p === '.'), 'Nama berkas tidak valid.');
  const path = filename.split('/').map(encodeURIComponent).join('/');
  const headers = {apikey:key, ...(key.startsWith('eyJ') ? {Authorization:`Bearer ${key}`} : {})};
  if (raw) headers['Content-Type'] = type;
  const result = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {method, headers, body:raw, signal:AbortSignal.timeout(20000)});
  check(result.status !== 404, 'Berkas tidak tersedia.', 404);
  check(result.ok, 'Penyimpanan berkas sedang bermasalah. Coba lagi.', 502);
  return method === 'GET' ? Buffer.from(await result.arrayBuffer()) : null;
}

export function contextFor(request, client) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '');
  const method = request.method.toUpperCase();
  const cookies = Object.fromEntries((request.headers.get('cookie') || '').split(';').map(x => x.trim().split('=')).filter(x => x.length === 2));
  const c = {request, url, path, method, cookies, afterCommit:[]};
  c.q = async (sql, args = []) => (await client.query(sql, args)).rows;
  c.one = async (sql, args = []) => (await c.q(sql, args))[0] || null;
  c.body = async (limit = 5 * 1048576) => {
    if (!c.parsed) {
      check(request.headers.get('content-type')?.split(';')[0] === 'application/json', 'Format permintaan harus JSON.');
      check(Number(request.headers.get('content-length') || 0) <= limit, 'Permintaan terlalu besar.', 413);
      const reader = request.body?.getReader();
      check(reader, 'Objek JSON diperlukan.');
      const chunks = []; let length = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) { await reader.cancel(); throw new HttpError(413, 'Permintaan terlalu besar.'); }
        chunks.push(Buffer.from(value));
      }
      try { c.parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'JSON tidak valid.'); }
      check(c.parsed && typeof c.parsed === 'object' && !Array.isArray(c.parsed), 'Objek JSON diperlukan.');
    }
    return c.parsed;
  };
  c.cookie = (name, value, age = 28800) => ({'Set-Cookie':`${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`});
  c.admin = async (required = true) => {
    if (c.adminSession === undefined) c.adminSession = cookies.session ? await c.one("SELECT * FROM sessions WHERE token_hash=$1 AND expires>$2 AND csrf NOT LIKE 'demo.%'", [sha(cookies.session), Math.floor(Date.now()/1000)]) : null;
    if (required) {
      check(c.adminSession, 'Silakan login sebagai admin.', 401);
      if (method !== 'GET') check(equal(request.headers.get('X-CSRF-Token'), c.adminSession.csrf), 'Sesi tidak valid. Muat ulang halaman.', 403);
    }
    return c.adminSession;
  };
  c.user = async (required = true) => {
    if (c.userSession === undefined) c.userSession = cookies.usession ? await c.one('SELECT s.token_hash,s.csrf,u.id AS uid,u.name,u.email,u.whatsapp FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires>$2', [sha(cookies.usession),Math.floor(Date.now()/1000)]) : null;
    if (required) {
      check(c.userSession, 'Silakan masuk atau daftar sebagai penyewa.', 401);
      if (method !== 'GET') check(equal(request.headers.get('X-CSRF-Token'), c.userSession.csrf), 'Sesi tidak valid. Muat ulang halaman.', 403);
    }
    return c.userSession;
  };
  c.file = async (doc) => {
    const ext = doc.filename.split('.').pop();
    const raw = await storage('GET', 'tenant-docs', doc.filename);
    return new Response(raw, {headers:{...responseHeaders,'Content-Type':contentType(ext),'Content-Disposition':`attachment; filename="${doc.kind}-v${doc.version}.${ext}"`}});
  };
  return c;
}

async function houseList(c, admin, id) {
  const conditions = [];
  if (id) conditions.push('h.id=$1');
  if (!admin) conditions.push("h.body::json->>'status' IN ('Tersedia','Dipesan')");
  const rows = await c.q("SELECT h.*, COALESCE((SELECT json_agg(json_build_object('id',p.id,'url','/media/'||p.id) ORDER BY p.position,p.id) FROM photos p WHERE p.house_id=h.id),'[]'::json) AS photos FROM houses h" + (conditions.length ? ' WHERE '+conditions.join(' AND ') : ''), id ? [id] : []);
  const result = rows.flatMap(row => {
    const house = JSON.parse(row.body);
    if (!admin && !['Tersedia','Dipesan'].includes(house.status)) return [];
    Object.assign(house,{id:row.id,revision:row.revision,photos:row.photos});
    if (admin) house.notice = leaseNotice(house);
    else for (const key of internalKeys) delete house[key];
    return [house];
  });
  if (id) { check(result.length, 'Properti tidak tersedia', 404); return result[0]; }
  return result.sort((a,b)=>(a.status !== 'Tersedia')-(b.status !== 'Tersedia') || a.name.localeCompare(b.name));
}

async function mainRoute(c) {
  const {path, method} = c;
  if (path === '/api/session' && method === 'GET') {
    const session = await c.admin(false);
    return json({authenticated:!!session,csrf:session?.csrf ?? null});
  }
  if (path === '/api/login' && method === 'POST') {
    const body = await c.body(10000);
    check(typeof body.username === 'string' && typeof body.password === 'string' && body.password.length <= 200, 'Isian login tidak valid.');
    const admin = await c.one('SELECT * FROM admin WHERE id=1');
    const computed = await passwordHash(body.password, admin?.salt || '00'.repeat(16));
    check(admin && equal(computed, admin.password_hash) && equal(body.username, admin.username), 'Nama pengguna atau kata sandi salah.', 401);
    const value = token(), csrf = token();
    await c.q('INSERT INTO sessions(token_hash,csrf,expires) VALUES($1,$2,$3)',[sha(value),csrf,Math.floor(Date.now()/1000)+28800]);
    return json({authenticated:true,csrf},200,c.cookie('session',value));
  }
  if (path === '/api/logout' && method === 'POST') {
    const session = await c.admin();
    await c.q('DELETE FROM sessions WHERE token_hash=$1',[session.token_hash]);
    return json({ok:true},200,c.cookie('session','',0));
  }
  let match = path.match(/^\/api\/(admin\/)?houses(?:\/([a-f0-9]+))?$/);
  if (match && method === 'GET') {
    if (match[1]) await c.admin();
    return json(await houseList(c,!!match[1],match[2]));
  }
  match = path.match(/^\/media\/([a-f0-9]+)$/);
  if (match && method === 'GET') {
    const photo = await c.one('SELECT p.*,h.body FROM photos p JOIN houses h ON h.id=p.house_id WHERE p.id=$1',[match[1]]);
    check(photo && (['Tersedia','Dipesan'].includes(JSON.parse(photo.body).status) || await c.admin(false)), 'Foto tidak tersedia.',404);
    return new Response(await storage('GET','asset-photos',photo.filename),{headers:{...responseHeaders,'Content-Type':contentType(photo.filename.split('.').pop())}});
  }
  if (path.startsWith('/api/admin/houses')) {
    await c.admin();
    if (path === '/api/admin/houses' && method === 'POST') {
      const house = validateHouse(await c.body());
      const id = hex();
      await c.q('INSERT INTO houses(id,code,body) VALUES($1,$2,$3)',[id,house.code,JSON.stringify(house)]);
      return json({id},201);
    }
    match = path.match(/^\/api\/admin\/houses\/([a-f0-9]+)(\/photos|\/photo-order)?$/);
    check(match, 'Tidak ditemukan.',404);
    const [ ,id,action] = match;
    const row = await c.one('SELECT * FROM houses WHERE id=$1 FOR UPDATE',[id]);
    check(row,'Rumah tidak ditemukan.',404);
    const body = await c.body();
    if (!action && method === 'PUT') {
      check(body.revision === row.revision,'Data telah berubah. Muat ulang sebelum menyimpan.',409);
      const house = validateHouse(body,JSON.parse(row.body));
      await c.q('UPDATE houses SET code=$1,body=$2,revision=revision+1 WHERE id=$3',[house.code,JSON.stringify(house),id]);
      return json({ok:true});
    }
    const photos = await c.q('SELECT * FROM photos WHERE house_id=$1 ORDER BY position,id',[id]);
    if (action === '/photos' && method === 'POST') {
      check(photos.length < 20,'Maksimal 20 foto per rumah.');
      const upload = readUpload(body,true), pid = hex(16), filename = pid+'.'+upload.extension;
      await storage('POST','asset-photos',filename,upload.raw,contentType(upload.extension));
      c.uploaded.push(['asset-photos',filename]);
      await c.q('INSERT INTO photos VALUES($1,$2,$3,$4)',[pid,id,filename,photos.length ? Math.max(...photos.map(p=>p.position))+1 : 0]);
    } else if (action === '/photos' && method === 'DELETE') {
      const photo = photos.find(p=>p.id === body.photo_id);
      check(photo,'Foto tidak ditemukan.');
      await c.q('DELETE FROM photos WHERE id=$1',[photo.id]);
      c.afterCommit.push(()=>storage('DELETE','asset-photos',photo.filename));
    } else if (action === '/photo-order' && method === 'PUT') {
      check(Array.isArray(body.ids) && body.ids.length === photos.length && new Set(body.ids).size === photos.length && body.ids.every(pid=>photos.some(p=>p.id===pid)),'Daftar foto berubah. Muat ulang halaman.');
      for (const [position,pid] of body.ids.entries()) await c.q('UPDATE photos SET position=$1 WHERE id=$2',[position,pid]);
    } else throw new HttpError(405,'Metode tidak diizinkan.');
    await c.q('UPDATE houses SET revision=revision+1 WHERE id=$1',[id]);
    return json({ok:true},method === 'POST' ? 201 : 200);
  }
  return tenantRoute(c);
}

export async function handleRequest(request, {ip = '', pool: injectedPool} = {}) {
  let client, c, inTransaction = false;
  try {
    check(['GET','POST','PUT','DELETE'].includes(request.method),'Metode tidak diizinkan.',405);
    const url = new URL(request.url), origin = request.headers.get('origin');
    if (request.method !== 'GET' && origin) check(origin === url.origin,'Asal permintaan tidak diizinkan.',403);
    const path = url.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/,'');
    if (path === '/api/config' && request.method === 'GET') return json(publicConfig());
    if (request.method === 'GET' && ['/api/session','/api/me'].includes(path)) {
      const cookieName = path === '/api/session' ? 'session' : 'usession';
      const hasCookie = (request.headers.get('cookie') || '').split(';').some(value=>value.trim().startsWith(cookieName+'=') && value.trim().slice(cookieName.length+1));
      if (!hasCookie) return json({authenticated:false,csrf:null,...(path === '/api/me' ? {user:null} : {})});
    }
    const pool = injectedPool || databasePool();
    client = await pool.connect();
    // Persist rate limits in the existing sessions table, across function instances.
    // These non-token keys never authenticate a user. No schema migration is needed.
    if (request.method === 'POST' && ['/api/login','/api/register','/api/user/login'].includes(path)) {
      const t = Math.floor(Date.now()/1000), key = 'rate:'+sha(path+':'+(ip || 'unknown'));
      await client.query('DELETE FROM sessions WHERE expires<$1',[t]);
      await client.query('DELETE FROM user_sessions WHERE expires<$1',[t]);
      const row = (await client.query("INSERT INTO sessions(token_hash,csrf,expires) VALUES($1,'1',$2) ON CONFLICT(token_hash) DO UPDATE SET csrf=CASE WHEN sessions.expires<=$3 THEN '1' ELSE LEAST(11,sessions.csrf::integer+1)::text END, expires=CASE WHEN sessions.expires<=$3 THEN $2 ELSE sessions.expires END RETURNING csrf",[key,t+900,t])).rows[0];
      check(Number(row.csrf) <= 10,'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',429);
    }
    if (request.method !== 'GET') {
      await client.query('BEGIN'); inTransaction = true;
      await client.query('SELECT pg_advisory_xact_lock(73629101)');
    }
    c = contextFor(request,client); c.uploaded = [];
    const result = await mainRoute(c);
    if (inTransaction) { await client.query('COMMIT'); inTransaction = false; }
    for (const work of c.afterCommit) try { await work(); } catch { console.error('Storage cleanup failed'); }
    return result;
  } catch (error) {
    if (inTransaction) try { await client.query('ROLLBACK'); } catch { /* connection lost */ }
    for (const [bucket,filename] of c?.uploaded || []) try { await storage('DELETE',bucket,filename); } catch { console.error('Upload cleanup failed'); }
    if (error instanceof HttpError || error.status === 503) return json({error:error.message},error.status);
    if (error.code === '23505') return json({error:'Data bertabrakan dengan data yang sudah ada. Kode atau email sudah dipakai.'},409);
    console.error('API failure:', error.code || error.name || 'unknown');
    return json({error:'Layanan sedang bermasalah. Periksa konfigurasi dan log Netlify Functions.'},503);
  } finally { client?.release(); }
}
