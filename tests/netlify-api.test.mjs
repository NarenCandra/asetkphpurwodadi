import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {zipSync,strToU8} from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import {handleRequest} from '../server/api.mjs';
import {passwordHash,hex,validateHouse,readUpload} from '../server/domain.mjs';
import {readXlsx,extractRecords,recordToHouse} from '../server/xlsx.mjs';
const connectionString = process.env.NETLIFY_TEST_DATABASE_URL;
const schema = 'netlify_test_'+hex(6);
let pool,owner;
before(async()=>{
  if (!connectionString) return;
  const uri = new URL(connectionString);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(uri.hostname),'Tests only run on a local disposable database.');
  owner = new pg.Pool({connectionString});
  await owner.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({connectionString,options:`-c search_path=${schema}`});
  const fixture = spawnSync('python',['-c',"import app, tenant, db, json; s=next(x for x in app.init_db.__code__.co_consts if isinstance(x,str) and 'CREATE TABLE IF NOT EXISTS admin' in x); print(json.dumps([db.pg_script(s),db.pg_script(tenant.SCHEMA)]))"],{encoding:'utf8'});
  assert.equal(fixture.status,0,fixture.stderr);
  for (const sql of JSON.parse(fixture.stdout)) await pool.query(sql);
  const salt = '11'.repeat(16);
  await pool.query('INSERT INTO admin VALUES(1,$1,$2,$3)',['test-admin',salt,await passwordHash('test-admin-password',salt)]);
  await pool.query('INSERT INTO houses(id,code,body) VALUES($1,$2,$3)',['a'.repeat(24),'PUBLIC-1',JSON.stringify({...validateHouse({name:'Aset publik',code:'PUBLIC-1'}),status:'Tersedia',internal_notes:'secret',inventory_number:'private'})]);
  await pool.query('INSERT INTO houses(id,code,body) VALUES($1,$2,$3)',['b'.repeat(24),'DRAFT-1',JSON.stringify(validateHouse({name:'Aset draft',code:'DRAFT-1'}))]);
});
after(async()=>{
  await pool?.end();
  if (owner) { await owner.query(`DROP SCHEMA ${schema} CASCADE`); await owner.end(); }
});
const integration = (name,fn) => test(name,{skip:!connectionString},fn);
function browser(ip) {
  const cookies = {}; let csrf = '';
  return {cookies,setCsrf:value=>{csrf=value;},async call(path,method='GET',body,extra={}) {
    const headers = {cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),...extra};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (csrf) headers['x-csrf-token'] = csrf;
    const result = await handleRequest(new Request('https://site.example'+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),{ip,pool});
    const cookie = result.headers.get('set-cookie');
    if (cookie) { const [name,value] = cookie.split(';')[0].split('='); cookies[name]=value; assert.match(cookie,/HttpOnly; SameSite=Strict/); assert.match(cookie,/Secure/); }
    const data = await result.json();
    return {status:result.status,data,headers:result.headers};
  }};
}
test('scrypt is compatible with the Python password format',async()=>{
  const salt='12'.repeat(16), password='Password-é-123';
  const result=spawnSync('python',['-c','import hashlib; print(hashlib.scrypt("Password-é-123".encode(),salt=bytes.fromhex("12"*16),n=16384,r=8,p=1).hex())'],{encoding:'utf8'});
  assert.equal(await passwordHash(password,salt),result.stdout.trim());
});
test('validation rejects invalid dates, status transitions, and unsafe uploads',()=>{
  assert.throws(()=>validateHouse({name:'x',code:'x',status:'Tersewa',confirm_status:true}),/Transisi/);
  assert.throws(()=>readUpload({data:Buffer.from('<svg/>').toString('base64')},true),/JPEG/);
  assert.throws(()=>readUpload({data:'%%%%'}),/valid/);
  assert.throws(()=>validateHouse({name:'x',code:'x',maps_url:'https://evil.example'}),/Maps/);
  const large = Buffer.alloc(3*1048576,0); large.set([255,216,255]);
  assert.equal(readUpload({data:large.toString('base64')},true).raw.length,large.length);
  assert.throws(()=>readUpload({data:Buffer.concat([large,Buffer.from([0])]).toString('base64')},true),/3 MB/);
});
test('production build disables demo without publishing runtime secrets',()=>{
  const marker='secret-build-probe-'+hex();
  const built=spawnSync('node',['scripts/build-netlify.cjs'],{encoding:'utf8',env:{...process.env,SUPABASE_SERVICE_ROLE_KEY:marker,DATABASE_URL:marker}});
  assert.equal(built.status,0,built.stderr);
  const deployment=fs.readFileSync('dist/assets/deployment.js','utf8');
  assert.match(deployment,/SEWARUMA_STATIC_DEMO = false/);
  assert.match(deployment,/SEWARUMA_NETLIFY = true/);
  assert.equal(fs.existsSync('dist/demo-data.json'),false);
  assert.equal(fs.existsSync('dist/server'),false);
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(file);
    else assert.equal(fs.readFileSync(file).includes(Buffer.from(marker)),false,'Secret exported into '+file);
  }};
  walk('dist');
});
test('XLSX parser matches Python records and legacy import fingerprints',()=>{
  const source = spawnSync('python',['-c',"import base64,json; from tests.test_tenant import tiny_xlsx; import tenant; raw=tiny_xlsx([['NO','OBJEK','NO. INVENTARIS','LOKASI','BENTUK KERJA SAMA','ESTIMASI 2026','KETERANGAN'],[1,'Aset café','INV-1','Purwodadi','sewa 1 th',2500000,'belum']]); _,_,rows=tenant.read_xlsx(raw); rec=tenant.extract_records(rows)[0]; print(json.dumps({'raw':base64.b64encode(raw).decode(),'house':tenant.record_to_house(rec,'PWD-001')}))"],{encoding:'utf8'});
  assert.equal(source.status,0,source.stderr);
  const {raw,house} = JSON.parse(source.stdout), parsed = readXlsx(Buffer.from(raw,'base64'));
  assert.equal(parsed.sheet,'Purwodadi');
  assert.deepEqual(recordToHouse(extractRecords(parsed.rows)[0],'PWD-001'),house);
  const hostile = zipSync({'xl/workbook.xml':strToU8('<!DOCTYPE foo><workbook/>')});
  assert.throws(()=>readXlsx(hostile));
});
integration('public catalogue hides private fields, draft assets, and admin routes',async()=>{
  const guest=browser('guest');
  const list=await guest.call('/api/houses');
  assert.equal(list.status,200); assert.equal(list.data.length,1);
  assert.equal(list.data[0].internal_notes,undefined); assert.equal(list.data[0].inventory_number,undefined);
  assert.equal((await guest.call('/api/houses/'+'b'.repeat(24))).status,404);
  assert.equal((await guest.call('/api/admin/houses')).status,401);
  assert.equal((await guest.call('/api/admin/tenants')).status,401);
  assert.equal((await guest.call('/api/my/ktp')).status,401);
  assert.equal((await guest.call('/media/'+'c'.repeat(32))).status,404);
});
integration('existing admin credentials, CSRF, edit conflicts, and logout',async()=>{
  const admin=browser('admin');
  const login=await admin.call('/api/login','POST',{username:'test-admin',password:'test-admin-password'});
  assert.equal(login.status,200); assert.equal(login.data.authenticated,true);
  assert.equal((await admin.call('/api/session')).data.authenticated,true);
  assert.equal((await admin.call('/api/admin/houses','POST',{name:'x',code:'x'})).status,403);
  admin.setCsrf(login.data.csrf);
  const created=await admin.call('/api/admin/houses','POST',{name:'New draft',code:'NEW-1'});
  assert.equal(created.status,201);
  const path='/api/admin/houses/'+created.data.id;
  const house=(await admin.call(path)).data;
  assert.equal((await admin.call(path,'PUT',{...house,name:'Changed'})).status,200);
  assert.equal((await admin.call(path,'PUT',house)).status,409);
  assert.equal((await admin.call('/api/admin/houses','POST',{name:'Bad origin',code:'BAD'},{origin:'https://evil.example'})).status,403);
  assert.equal((await admin.call('/api/logout','POST',{})).status,200);
  assert.equal((await admin.call('/api/admin/houses')).status,401);
});
integration('tenant registration, duplicate survey, ownership, and cancellations',async()=>{
  const u=browser('tenant-one'), v=browser('tenant-two');
  const register=await u.call('/api/register','POST',{name:'Tenant One',email:'one@example.test',password:'longpassword',whatsapp:'081234567890'});
  assert.equal(register.status,201); u.setCsrf(register.data.csrf);
  const second=await v.call('/api/register','POST',{name:'Tenant Two',email:'two@example.test',password:'longpassword',whatsapp:'081234567891'});
  assert.equal(second.status,201); v.setCsrf(second.data.csrf);
  const survey=await u.call('/api/my/applications','POST',{kind:'survei',house_id:'a'.repeat(24)});
  assert.equal(survey.status,201); assert.match(survey.data.ref,/^PGJ-\d{4}-00001$/);
  const duplicate=await u.call('/api/my/applications','POST',{kind:'survei',house_id:'a'.repeat(24)});
  assert.equal(duplicate.data.existing,true);
  const path='/api/my/applications/'+survey.data.id;
  assert.equal((await v.call(path)).status,404);
  assert.equal((await u.call('/api/admin/houses')).status,401);
  assert.equal((await u.call('/api/my/applications','POST',{kind:'sewa_baru',house_id:'a'.repeat(24)})).status,400);
  assert.equal((await u.call(path+'/cancel','POST',{})).status,200);
  assert.equal((await u.call(path)).data.status,'dibatalkan');
  assert.equal((await u.call('/api/user/logout','POST',{})).status,200);
  const login=await u.call('/api/user/login','POST',{email:'ONE@example.test',password:'longpassword'});
  assert.equal(login.status,200);
});
integration('rate limiting is shared across separate function requests',async()=>{
  const bad=browser('rate-limit-ip');
  for (let i=0;i<10;i++) assert.equal((await bad.call('/api/login','POST',{username:'bad',password:'bad'})).status,401);
  assert.equal((await bad.call('/api/login','POST',{username:'bad',password:'bad'})).status,429);
});
integration('function rewrite paths resolve to the same API',async()=>{
  const guest=browser('rewrites');
  assert.equal((await guest.call('/.netlify/functions/api/api/houses')).status,200);
  assert.equal((await guest.call('/.netlify/functions/api/api/session')).data.authenticated,false);
});
integration('private uploads, admin verification, activation, and renewal work end to end',async()=>{
  const originalFetch=globalThis.fetch, objects=new Map();
  const previousUrl=process.env.SUPABASE_URL, previousKey=process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL='https://storage.example'; process.env.SUPABASE_SECRET_KEY='sb_secret_test';
  globalThis.fetch=async (url,init)=>{
    assert.equal(new URL(url).host,'storage.example');
    assert.equal(init.headers.apikey,'sb_secret_test');
    assert.equal(init.headers.Authorization,undefined);
    if (init.method==='POST') { objects.set(url,Buffer.from(init.body)); return new Response('{}'); }
    if (init.method==='DELETE') { objects.delete(url); return new Response('{}'); }
    return objects.has(url) ? new Response(objects.get(url)) : new Response('{}',{status:404});
  };
  try {
    const admin=browser('flow-admin'), u=browser('flow-tenant'), other=browser('flow-other');
    const login=await admin.call('/api/login','POST',{username:'test-admin',password:'test-admin-password'});
    admin.setCsrf(login.data.csrf);
    const reg=await u.call('/api/register','POST',{name:'Flow Tenant',email:'flow@example.test',password:'flow-password',whatsapp:'081234567892'});
    u.setCsrf(reg.data.csrf);
    const regOther=await other.call('/api/register','POST',{name:'Other Tenant',email:'flow-other@example.test',password:'flow-password',whatsapp:'081234567893'});
    other.setCsrf(regOther.data.csrf);
    const created=await admin.call('/api/admin/houses','POST',{name:'Flow house',code:'FLOW-1',yearly:{price:2500000,minimum:1}});
    const hp='/api/admin/houses/'+created.data.id;
    const image={data:Buffer.from([255,216,255,1,2,3]).toString('base64')};
    assert.equal((await admin.call(hp+'/photos','POST',image)).status,201);
    let h=(await admin.call(hp)).data;
    const photoUrl=h.photos[0].url;
    const rawReq=(path,cookies)=>handleRequest(new Request('https://site.example'+path,{headers:{cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')}}),{pool});
    assert.equal((await rawReq(photoUrl,{})).status,404);
    assert.equal((await rawReq(photoUrl,admin.cookies)).status,200);
    assert.equal((await admin.call(hp,'PUT',{...h,status:'Tersedia',confirm_status:true})).status,200);
    assert.equal((await rawReq(photoUrl,{})).status,200);
    const pdf={name:'test.pdf',data:Buffer.from('%PDF-1.4\nTest document').toString('base64')};
    assert.equal((await u.call('/api/my/ktp','POST',pdf)).status,201);
    const ktp=(await u.call('/api/my/ktp')).data.latest;
    assert.equal((await rawReq(ktp.url,other.cookies)).status,404);
    assert.equal((await rawReq(ktp.url,u.cookies)).status,200);
    assert.equal((await admin.call('/api/admin/tenants/'+reg.data.user.id)).data.ktp.id,ktp.id);
    const survey = await u.call('/api/my/applications','POST',{kind:'survei',house_id:h.id});
    assert.equal(survey.status,201);
    assert.equal((await admin.call('/api/admin/applications/'+survey.data.id,'PUT',{status:'selesai'})).status,200);
    assert.equal((await u.call('/api/my/applications/'+survey.data.id)).data.step,3);
    const app=await u.call('/api/my/applications','POST',{kind:'sewa_baru',house_id:h.id});
    assert.equal(app.status,201);
    const ap='/api/admin/applications/'+app.data.id, my='/api/my/applications/'+app.data.id;
    assert.equal((await admin.call(ap,'PUT',{status:'disetujui'})).status,400);
    assert.equal((await admin.call(ap,'PUT',{status:'selesai',payment:'lunas'})).status,400);
    assert.equal((await admin.call(ap+'/documents','POST',pdf)).status,201);
    assert.equal((await u.call(my+'/documents','POST',pdf)).status,201);
    const detail=(await admin.call(ap)).data;
    const signed=detail.documents.find(d=>d.kind==='surat_ttd');
    assert.equal((await admin.call('/api/admin/documents/'+ktp.id,'PUT',{status:'terverifikasi'})).status,200);
    assert.equal((await admin.call('/api/admin/documents/'+signed.id,'PUT',{status:'diterima'})).status,200);
    assert.equal((await admin.call(ap,'PUT',{status:'disetujui',payment:'dp'})).status,200);
    assert.equal((await admin.call(ap)).data.status,'disetujui');
    assert.equal((await admin.call(ap,'PUT',{status:'selesai',payment:'dp'})).status,400);
    assert.equal((await admin.call(ap,'PUT',{status:'disetujui',payment:'lunas'})).status,200);
    assert.equal((await admin.call(ap)).data.status,'selesai');
    assert.equal((await u.call(my)).data.status,'selesai');
    assert.equal((await admin.call(ap+'/activate','POST',{confirm:true,period:'yearly',start:'2027-01-01',end:'2027-12-31'})).status,400);
    h=(await admin.call(hp)).data;
    assert.equal((await admin.call(hp,'PUT',{...h,status:'Dipesan',confirm_status:true})).status,200);
    const active=await admin.call(ap+'/activate','POST',{confirm:true,period:'yearly',start:'2027-01-01',end:'2027-12-31'});
    assert.equal(active.status,200);
    assert.equal((await rawReq(photoUrl,{})).status,404);
    const leases=(await u.call('/api/my/leases')).data;
    assert.equal(leases[0].current.end,'2027-12-31');
    const renewal=await u.call('/api/my/leases/'+active.data.lease_id+'/renew','POST',{});
    assert.equal(renewal.status,201);
    const rp='/api/admin/applications/'+renewal.data.id;
    assert.equal((await admin.call(rp+'/documents','POST',pdf)).status,201);
    assert.equal((await u.call('/api/my/applications/'+renewal.data.id+'/documents','POST',pdf)).status,201);
    const rd=(await admin.call(rp)).data.documents.find(d=>d.kind==='surat_ttd');
    assert.equal((await admin.call('/api/admin/documents/'+rd.id,'PUT',{status:'diterima'})).status,200);
    assert.equal((await admin.call(rp,'PUT',{status:'disetujui',payment:'lunas'})).status,200);
    assert.equal((await admin.call(rp)).data.status,'selesai');
    assert.equal((await admin.call(rp+'/extend','POST',{confirm:true,period:'yearly',end:'2028-12-31'})).status,200);
    assert.equal((await u.call('/api/my/leases')).data[0].periods.length,2);
    assert.equal((await admin.call(rp+'/extend','POST',{confirm:true,end:'2029-12-31'})).status,400);
    assert.ok(objects.size>0);
  } finally {
    globalThis.fetch=originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY=previousKey;
  }
});
integration('Excel import previews, commits, and deduplicates existing rows',async()=>{
  const admin=browser('import-admin');
  const login=await admin.call('/api/login','POST',{username:'test-admin',password:'test-admin-password'}); admin.setCsrf(login.data.csrf);
  const source=spawnSync('python',['-c',"import base64; from tests.test_tenant import tiny_xlsx; print(base64.b64encode(tiny_xlsx([['NO','OBJEK','KETERANGAN'],[1,'Imported test','belum']])).decode())"],{encoding:'utf8'});
  assert.equal(source.status,0,source.stderr);
  const body={data:source.stdout.trim(),publish:true};
  const preview=await admin.call('/api/admin/import','POST',body);
  assert.equal(preview.status,200); assert.equal(preview.data.new,1); assert.equal(preview.data.committed,false);
  const imported=await admin.call('/api/admin/import','POST',{...body,commit:true});
  assert.equal(imported.data.new,1); assert.equal(imported.data.published_new,1);
  const duplicate=await admin.call('/api/admin/import','POST',{...body,commit:true});
  assert.equal(duplicate.data.new,0); assert.equal(duplicate.data.skipped,1);
});
integration('admin navbar lists use a fixed query count and preserve tenant/document data',async()=>{
  const admin=browser('admin-list-performance');
  const login=await admin.call('/api/login','POST',{username:'test-admin',password:'test-admin-password'});
  assert.equal(login.status,200);
  for (const [path,budget] of [['/api/admin/applications',3],['/api/admin/tenants',2]]) {
    let queries=0;
    const trackedPool={connect:async()=>{
      const client=await pool.connect();
      return {query:(...args)=>{queries++;return client.query(...args);},release:()=>client.release()};
    }};
    const response=await handleRequest(new Request('https://site.example'+path,{headers:{cookie:'session='+admin.cookies.session}}),{pool:trackedPool});
    assert.equal(response.status,200);
    assert.ok(queries<=budget,`${path}: ${queries} queries exceeds ${budget}`);
    const rows=await response.json();
    assert.ok(rows.length>0);
    if(path.endsWith('applications')) {
      const application=rows.find(a=>a.tenant.email==='flow@example.test' && a.kind==='sewa_baru');
      assert.equal(application.ktp_status,'terverifikasi');
      assert.equal(application.house.name,'Flow house');
      assert.equal(application.status,'selesai');
      assert.equal(typeof application.pending_documents,'number');
    } else {
      const tenant=rows.find(u=>u.email==='flow@example.test');
      assert.equal(tenant.ktp.status,'terverifikasi');
      assert.equal(tenant.applications,3);
      assert.equal(tenant.open,1);
      assert.equal(tenant.password_hash,undefined);
    }
  }
});
