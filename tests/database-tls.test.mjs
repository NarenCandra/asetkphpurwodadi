import {test} from 'node:test';
import assert from 'node:assert/strict';
import {X509Certificate} from 'node:crypto';
import {databaseTls} from '../server/database-tls.mjs';
import {supabaseCa} from '../server/supabase-ca.mjs';

test('bundled Supabase CA is valid and has the downloaded certificate fingerprint',()=>{
  const cert = new X509Certificate(supabaseCa);
  assert.equal(cert.fingerprint256,'80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  assert.equal(cert.ca,true);
  assert.equal(cert.verify(cert.publicKey),true);
  assert.ok(Date.parse(cert.validTo)>Date.now());
});
test('Supabase database and pooler verify TLS with bundled and standard roots',()=>{
  for (const hostname of ['db.bgiadvrfxqftgzmssvqy.supabase.co','aws-0-eu-west-2.pooler.supabase.com']) {
    const config = databaseTls(hostname);
    assert.equal(config.rejectUnauthorized,true);
    assert.ok(config.ca.includes(supabaseCa));
    assert.ok(config.ca.length>1);
  }
  assert.ok(!databaseTls('db.example.com').ca.includes(supabaseCa));
  assert.ok(!databaseTls('db.supabase.co.evil.example').ca.includes(supabaseCa));
});
test('PEM from Netlify supports multiline, escaped newlines, quotes, and rejects bad input',()=>{
  for (const value of [supabaseCa, supabaseCa.replace(/\n/g,'\\n'),JSON.stringify(supabaseCa)]) {
    const config = databaseTls('db.example.com',value);
    assert.equal(config.rejectUnauthorized,true);
    assert.equal(new X509Certificate(config.ca.at(-1)).fingerprint256,new X509Certificate(supabaseCa).fingerprint256);
  }
  assert.throws(()=>databaseTls('db.example.com','prod-ca-2021.crt'),/DATABASE_CA_CERT tidak valid/);
  assert.equal(databaseTls('127.0.0.1'),false);
});
