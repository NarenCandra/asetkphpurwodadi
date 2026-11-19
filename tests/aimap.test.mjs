import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {aiMapping} from '../server/aimap.mjs';

const unmapped = [{col: 5, header: 'Pemilik Lahan'}, {col: 6, header: 'Tentang Lokasi'}];
const rows = [{row: 9, cells: {5: 'Pak Budi', 6: 'Dekat pasar'}}];
let seen = [], reply = {}, status = 200;
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => { seen.push({url: req.url, headers: req.headers, body: JSON.parse(body)}); res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(reply)); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const env = (extra = {}) => ({GROQ_API_KEY: 'gsk_uji', GROQ_BASE_URL: base + '/openai/v1', ...extra});
test.after(() => server.close());

test('Groq: bentuk permintaan dan pembacaan jawaban', async () => {
  seen = []; status = 200; reply = {choices: [{message: {content: '{"Pemilik Lahan": "inventaris", "Tentang Lokasi": null}'}}]};
  const out = await aiMapping(unmapped, rows, env());
  assert.deepEqual(out, {map: {'Pemilik Lahan': 'inventaris'}, used: true});
  assert.equal(seen[0].url, '/openai/v1/chat/completions');
  assert.equal(seen[0].headers.authorization, 'Bearer gsk_uji');
  assert.equal(seen[0].body.model, 'llama-3.3-70b-versatile');
  assert.deepEqual(seen[0].body.response_format, {type: 'json_object'});
  assert.match(seen[0].body.messages[0].content, /JSON/);
});

test('jawaban tidak valid disaring, kegagalan tidak melempar error', async () => {
  reply = {choices: [{message: {content: '```json\n{"Pemilik Lahan": "ngawur", "Asing": "nama", "Tentang Lokasi": "deskripsi"}\n```'}}]};
  assert.deepEqual((await aiMapping(unmapped, rows, env())).map, {'Tentang Lokasi': 'deskripsi'});
  status = 500;
  const failed = await aiMapping(unmapped, rows, env());
  assert.equal(failed.used, false); assert.match(failed.error, /AI tidak dapat dihubungi/);
});

test('tanpa kunci tidak memanggil apa pun; Anthropic jadi cadangan', async () => {
  seen = []; status = 200;
  assert.deepEqual(await aiMapping(unmapped, rows, {}), {map: {}, used: false}); assert.equal(seen.length, 0);
  reply = {content: [{type: 'text', text: '{"Pemilik Lahan": "kondisi"}'}]};
  const out = await aiMapping(unmapped, rows, {ANTHROPIC_API_KEY: 'sk-ant-uji', ANTHROPIC_BASE_URL: base});
  assert.deepEqual(out, {map: {'Pemilik Lahan': 'kondisi'}, used: true});
  assert.equal(seen[0].url, '/v1/messages');
});
