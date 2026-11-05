"""Tes lapisan Supabase: terjemahan SQL, Row, diagnostik, dan Supabase Storage (server tiruan)."""
import base64
import contextlib
import io
import json
import os
import re
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app
import db as database
import storage
import test_tenant

KEY = 'kunci-uji-service-role'


class FakeSupabaseStorage(ThreadingHTTPServer):
    """Meniru endpoint /storage/v1 yang dipakai storage.py."""

    def __init__(self):
        super().__init__(('127.0.0.1', 0), FakeHandler)
        self.buckets, self.objects, self.requests, self.fail = set(), {}, [], False
        threading.Thread(target=self.serve_forever, daemon=True).start()


class FakeHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body=b'', ctype='application/json'):
        if not isinstance(body, bytes):
            body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_any(self):
        server = self.server
        length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(length) if length else b''
        server.requests.append((self.command, self.path, dict(self.headers)))
        if self.headers.get('Authorization') != 'Bearer ' + KEY or self.headers.get('apikey') != KEY:
            return self.reply(401, {'message': 'Unauthorized'})
        if server.fail:
            return self.reply(500, {'message': 'boom'})
        path = unquote(self.path)
        if path == '/storage/v1/bucket' and self.command == 'POST':
            name = json.loads(data)['id']
            if name in server.buckets:
                return self.reply(409, {'error': 'Duplicate', 'message': 'The resource already exists'})
            server.buckets.add(name)
            return self.reply(200, {'name': name})
        match = re.fullmatch(r'/storage/v1/object/([^/]+)/(.+)', path)
        if not match or match[1] not in server.buckets:
            return self.reply(404, {'message': 'Bucket not found'})
        key = (match[1], match[2])
        if self.command == 'POST':
            server.objects[key] = (data, self.headers.get('Content-Type'))
            return self.reply(200, {'Key': '/'.join(key)})
        if self.command == 'GET':
            if key not in server.objects:
                return self.reply(400, {'statusCode': '404', 'message': 'Object not found'})
            return self.reply(200, server.objects[key][0], server.objects[key][1] or 'application/octet-stream')
        if self.command == 'DELETE':
            server.objects.pop(key, None)
            return self.reply(200, {'message': 'Successfully deleted'})
        return self.reply(405, {})

    do_GET = do_POST = do_DELETE = handle_any


class SqlLayerTests(unittest.TestCase):
    def test_translate_placeholders(self):
        self.assertEqual(database.translate('SELECT * FROM a WHERE x=? AND y=?', [1, 2]), 'SELECT * FROM a WHERE x=%s AND y=%s')
        self.assertEqual(database.translate("SELECT 1 WHERE c LIKE 'D-%' AND x=?", [1]), "SELECT 1 WHERE c LIKE 'D-%%' AND x=%s")
        self.assertEqual(database.translate("SELECT COUNT(*) FROM h WHERE c LIKE 'D-%'", ()), "SELECT COUNT(*) FROM h WHERE c LIKE 'D-%'")

    def test_pg_script(self):
        script = 'PRAGMA journal_mode=WAL; CREATE TABLE t (code TEXT UNIQUE COLLATE NOCASE, expires INTEGER NOT NULL);'
        out = database.pg_script(script)
        for forbidden in ('PRAGMA', 'COLLATE', 'expires INTEGER'):
            self.assertNotIn(forbidden, out)
        self.assertIn('expires BIGINT', out)

    def test_row_behaves_like_sqlite_row(self):
        row = database.Row(['a', 'b'], (1, 'x'))
        self.assertEqual((row[0], row['b'], row.keys(), dict(row)), (1, 'x', ['a', 'b'], {'a': 1, 'b': 'x'}))
        first, second = row
        self.assertEqual((first, second), (1, 'x'))
        with self.assertRaises(IndexError):
            row['zzz']

    def test_every_sql_statement_is_portable(self):
        """Larang konstruksi khusus SQLite yang tidak berjalan di Postgres."""
        banned = [r'COLLATE NOCASE(?!.*SCHEMA)', r'\?\d', r' IS \?', r'SUM\(\w+=', r'INSERT OR ', r'AUTOINCREMENT', r'lastrowid']
        root = Path(app.__file__).parent
        for name in ('app.py', 'tenant.py', 'seed.py'):
            source = (root / name).read_text(encoding='utf-8')
            source = source.replace('UNIQUE COLLATE NOCASE', 'UNIQUE')  # hanya di skema; pg_script menghapusnya
            for pattern in banned:
                self.assertIsNone(re.search(pattern, source), f'{name}: {pattern}')

    def test_rls_covers_every_table(self):
        root = Path(app.__file__).parent
        source = (root / 'app.py').read_text(encoding='utf-8') + (root / 'tenant.py').read_text(encoding='utf-8')
        created = set(re.findall(r'CREATE TABLE IF NOT EXISTS (\w+)', source))
        self.assertEqual(created, set(app.OWN_TABLES))

    def test_db_check_on_sqlite(self):
        with tempfile.TemporaryDirectory() as folder:
            original = app.DATA, app.DB
            app.DATA, app.DB = Path(folder), Path(folder) / 'c.sqlite3'
            try:
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    app.db_check()
            finally:
                app.DATA, app.DB = original
        text = out.getvalue()
        for expected in ('SQLite lokal', 'folder lokal', 'Skema    : OK', 'Storage  : unggah, unduh, hapus OK', 'Semua pemeriksaan berhasil.'):
            self.assertIn(expected, text)


class RemoteStorageTests(test_tenant.TenantTests):
    """Seluruh tes alur penyewa dijalankan ulang dengan berkas di (tiruan) Supabase Storage."""

    @classmethod
    def setUpClass(cls):
        cls.fake = FakeSupabaseStorage()
        cls.saved = {k: os.environ.get(k) for k in ('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')}
        os.environ['SUPABASE_URL'] = f'http://127.0.0.1:{cls.fake.server_port}'
        os.environ['SUPABASE_SERVICE_ROLE_KEY'] = KEY
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        for key, value in cls.saved.items():
            os.environ.pop(key, None) if value is None else os.environ.__setitem__(key, value)
        cls.fake.shutdown()
        cls.fake.server_close()

    def test_remote_mode_is_active_and_buckets_created(self):
        self.assertTrue(storage.remote())
        self.assertEqual(self.fake.buckets, {'asset-photos', 'tenant-docs'})
        storage.ensure()  # idempoten: bucket sudah ada (409) tidak dianggap error

    def test_documents_and_photos_live_in_storage_not_disk(self):
        a, t = self.admin(), self.tenant()
        self.assertEqual(self.upload(t, '/api/my/ktp')[0], 201)
        docs = [k for k in self.fake.objects if k[0] == 'tenant-docs']
        self.assertTrue(docs and all(re.fullmatch(r'[0-9a-f]+/[0-9a-f]+\.pdf', k[1]) for k in docs))
        ktp = t.call('/api/my/ktp')[1]['latest']
        self.assertEqual(t.call(ktp['url'], raw=True)[1], test_tenant.PDF)
        hid = self.house(a, 'REMOTE-1')
        photos = [k for k in self.fake.objects if k[0] == 'asset-photos']
        self.assertTrue(photos)
        pid = a.call(f'/api/admin/houses/{hid}')[1]['photos'][0]['id']
        self.assertEqual(Client(self.port).call(f'/media/{pid}', raw=True)[0], 200)
        self.assertEqual(a.call(f'/api/admin/houses/{hid}/photos', 'DELETE', {'photo_id': pid})[0], 200)
        self.assertFalse([k for k in self.fake.objects if k[1].startswith(pid)])
        self.assertFalse((app.DATA / 'private').exists() or (app.DATA / 'uploads').exists())
        for method, path, headers in self.fake.requests[-4:]:
            self.assertEqual({k.lower(): v for k, v in headers.items()}.get('authorization'), 'Bearer ' + KEY)
        uploads = [r for r in self.fake.requests if r[0] == 'POST' and '/object/' in r[1]]
        self.assertTrue(uploads and all({k.lower(): v for k, v in r[2].items()}.get('x-upsert') == 'true' for r in uploads))

    def test_storage_outage_returns_502_not_500(self):
        t = self.tenant()
        self.fake.fail = True
        try:
            status, data = self.upload(t, '/api/my/ktp')
        finally:
            self.fake.fail = False
        self.assertEqual(status, 502)
        self.assertIn('Penyimpanan', data['error'])
        self.assertEqual(t.call('/api/my/ktp')[1]['latest'], None)  # tidak ada catatan yatim

    def test_db_check_uses_remote_storage(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            app.db_check()
        self.assertIn('Supabase Storage', out.getvalue())
        self.assertIn('Semua pemeriksaan berhasil.', out.getvalue())


Client = test_tenant.Client

if __name__ == '__main__':
    unittest.main()
