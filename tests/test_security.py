"""Uji keamanan kotak-hitam: header, cookie, autentikasi, CSRF, IDOR, path traversal, injeksi, unggahan, rate limit."""
import base64
import http.client
import json
import secrets
import sys
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import app  # noqa: E402
import test_tenant  # noqa: E402
from test_tenant import PDF, Client  # noqa: E402


def raw(port, method, path, headers=None, body=None, timeout=15):
    """Permintaan HTTP apa adanya (tanpa normalisasi path)."""
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=timeout)
    conn.request(method, path, body, headers or {})
    response = conn.getresponse()
    data = response.read()
    pairs = response.getheaders()
    conn.close()
    return response.status, {k.lower(): v for k, v in pairs}, data, [v for k, v in pairs if k.lower() == 'set-cookie']


class SecurityTests(unittest.TestCase):
    _t = test_tenant.TenantTests
    admin, tenant, house, set_house_status, upload = _t.admin, _t.tenant, _t.house, _t.set_house_status, _t.upload

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.original = app.DATA, app.DB
        app.DATA = Path(cls.temp.name)
        app.DB = app.DATA / 'catalog.sqlite3'
        app.init_db()
        cls.admin_password = secrets.token_urlsafe(20)
        salt = secrets.token_hex(16)
        with app.connect() as db:
            db.execute('INSERT INTO admin VALUES(1,?,?,?)', ('adm', salt, app.password_hash(cls.admin_password, salt)))
        cls.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.port = cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        app.DATA, app.DB = cls.original
        cls.temp.cleanup()

    def setUp(self):
        app.ATTEMPTS.clear()

    # --- header dan cookie -------------------------------------------------
    def test_security_headers_on_pages_api_and_assets(self):
        for path in ('/', '/rumah', '/api/houses', '/assets/app.js'):
            _, h, _, _ = raw(self.port, 'GET', path)
            self.assertEqual(h.get('x-content-type-options'), 'nosniff', path)
            self.assertEqual(h.get('x-frame-options'), 'DENY', path)
            self.assertIn('strict-origin', h.get('referrer-policy', ''), path)
            csp = h.get('content-security-policy', '')
            self.assertIn("default-src 'self'", csp, path)
            self.assertIn("object-src 'none'", csp, path)
            self.assertNotIn('unsafe-inline', csp.replace("style-src 'self'", ''), path)
            self.assertNotIn('unsafe-eval', csp, path)

    def test_server_header_does_not_leak_versions(self):
        _, h, _, _ = raw(self.port, 'GET', '/')
        self.assertNotRegex(h.get('server', ''), r'Python|BaseHTTP|\d+\.\d+')

    def test_session_cookies_are_httponly_and_samesite(self):
        _, _, _, cookies = raw(self.port, 'POST', '/api/login', {'Content-Type': 'application/json'}, json.dumps({'username': 'adm', 'password': self.admin_password}))
        self.assertTrue(cookies and all('HttpOnly' in c and 'SameSite=Strict' in c for c in cookies), cookies)
        body = json.dumps({'name': 'Cookie Uji', 'email': f'{secrets.token_hex(4)}@contoh.id', 'whatsapp': '081234567890', 'password': 'rahasia-uji-1'})
        _, _, _, cookies = raw(self.port, 'POST', '/api/register', {'Content-Type': 'application/json'}, body)
        self.assertTrue(cookies and all('HttpOnly' in c and 'SameSite=Strict' in c for c in cookies), cookies)

    def test_no_cors_headers_for_foreign_origin(self):
        for method in ('GET', 'OPTIONS'):
            _, h, _, _ = raw(self.port, method, '/api/houses', {'Origin': 'https://evil.example'})
            self.assertNotIn('access-control-allow-origin', h)

    # --- autentikasi dan otorisasi -----------------------------------------
    def test_admin_endpoints_require_login(self):
        for method, path in (('GET', '/api/admin/houses'), ('GET', '/api/admin/applications'), ('POST', '/api/admin/houses'), ('POST', '/api/admin/import'),
                             ('POST', '/api/admin/import/convert'), ('POST', '/api/admin/import/apply'), ('GET', '/api/admin/documents/abc/file')):
            status, _, body, _ = raw(self.port, method, path, {'Content-Type': 'application/json'}, '{}' if method == 'POST' else None)
            self.assertEqual(status, 401, f'{method} {path} -> {status}')
            self.assertNotIn(b'Traceback', body)

    def test_tenant_cannot_use_admin_api(self):
        t = self.tenant()
        for method, path in (('GET', '/api/admin/houses'), ('GET', '/api/admin/applications'), ('POST', '/api/admin/import/convert')):
            self.assertEqual(t.call(path, method, {} if method == 'POST' else None)[0], 401, path)

    def test_my_endpoints_require_login(self):
        for path in ('/api/my/applications', '/api/my/ktp', '/api/my/leases'):
            self.assertEqual(raw(self.port, 'GET', path)[0], 401, path)

    def test_mass_assignment_cannot_escalate_or_set_status(self):
        c = Client(self.port)
        status, data = c.call('/api/register', 'POST', {'name': 'Eskalasi', 'email': f'{secrets.token_hex(4)}@contoh.id', 'whatsapp': '081234567891', 'password': 'rahasia-uji-1', 'is_admin': True, 'admin': True, 'id': 'x'})
        self.assertEqual(status, 201)
        c.csrf = data['csrf']
        self.assertEqual(c.call('/api/admin/houses')[0], 401)
        a = self.admin()
        hid = self.house(a, 'SEC-MASS')
        c.call('/api/my/ktp', 'POST', {'data': base64.b64encode(PDF).decode(), 'name': 'k.pdf'})
        status, app_data = c.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid, 'status': 'disetujui', 'payment': 'lunas'})
        self.assertEqual(status, 201, app_data)
        self.assertNotIn(app_data.get('status'), ('disetujui', 'selesai'))
        self.assertNotEqual(app_data.get('payment'), 'lunas')

    def test_idor_between_tenants_and_private_files(self):
        a, t1, t2 = self.admin(), self.tenant(), self.tenant()
        hid = self.house(a, 'SEC-IDOR')
        self.upload(t1, '/api/my/ktp')
        ktp = t1.call('/api/my/ktp')[1]['latest']
        self.assertEqual(t2.call(ktp['url'], raw=True)[0], 404)
        self.assertEqual(Client(self.port).call(ktp['url'], raw=True)[0], 401)
        survey = t1.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})[1]['id']
        self.assertEqual(t2.call(f'/api/my/applications/{survey}')[0], 404)
        self.assertEqual(t2.call(f'/api/my/applications/{survey}/cancel', 'POST', {})[0], 404)

    def test_draft_house_photos_are_not_public(self):
        a = self.admin()
        hid = self.house(a, 'SEC-DRAFT', status='Draft')
        photo = a.call(f'/api/admin/houses/{hid}')[1]['photos'][0]
        status, h, _, _ = raw(self.port, 'GET', photo['url'])
        self.assertEqual(status, 404)
        self.assertEqual(raw(self.port, 'GET', '/api/houses')[2].decode().count('SEC-DRAFT'), 0)

    # --- CSRF dan asal permintaan -------------------------------------------
    def test_csrf_token_is_required_for_state_changes(self):
        a, t = self.admin(), self.tenant()
        for client, path, body in ((a, '/api/admin/houses', {'name': 'x'}), (t, '/api/my/applications', {'kind': 'survei', 'house_id': 'x'})):
            good = client.csrf
            for token in (None, 'salah', good[:-1] + ('A' if good[-1] != 'A' else 'B')):
                client.csrf = token
                self.assertEqual(client.call(path, 'POST', body)[0], 403, (path, token))
            client.csrf = good

    def test_cross_origin_state_change_is_blocked(self):
        a = self.admin()
        headers = {'Content-Type': 'application/json', 'X-CSRF-Token': a.csrf, 'Origin': 'https://evil.example', 'Cookie': '; '.join(f'{k}={v}' for k, v in a.cookies.items())}
        self.assertEqual(raw(self.port, 'POST', '/api/admin/houses', headers, '{}')[0], 403)

    def test_session_is_invalidated_on_logout(self):
        for client, logout in ((self.admin(), '/api/logout'), (self.tenant(), '/api/user/logout')):
            old = dict(client.cookies)
            self.assertEqual(client.call(logout, 'POST', {})[0], 200)
            replay = Client(self.port)
            replay.cookies = old
            self.assertEqual(replay.call('/api/admin/houses' if logout == '/api/logout' else '/api/my/applications')[0], 401)

    # --- path traversal, injeksi, kebocoran ---------------------------------
    def test_source_and_secrets_are_not_served(self):
        probes = ('/app.py', '/tenant.py', '/db.py', '/.env', '/.git/config', '/data/catalog.sqlite3', '/tests/test_app.py', '/server/api.mjs', '/package.json',
                  '/assets/../app.py', '/assets/..%2fapp.py', '/assets/%2e%2e/app.py', '/..%2f..%2f.env', '/media/../../data/catalog.sqlite3',
                  '/private/..%2f..%2fapp.py', '/assets/%2e%2e%2f%2e%2e%2fdata%2fcatalog.sqlite3', '/assets/..\\app.py')
        for path in probes:
            status, h, body, _ = raw(self.port, 'GET', path)
            leaked = any(m in body for m in (b'SQLite format 3', b'import hashlib', b'DATABASE_URL=', b'SUPABASE_', b'def main(', b'[core]'))
            self.assertFalse(leaked, f'{path} membocorkan isi berkas ({status})')
            if status == 200:
                self.assertIn('text/html', h.get('content-type', ''), path)  # hanya SPA fallback, bukan berkas

    def test_sql_injection_attempts_do_not_bypass_or_crash(self):
        payloads = ["' OR '1'='1", "admin'--", '" OR 1=1 --', "'; DROP TABLE houses;--", "x' UNION SELECT token_hash,csrf,1 FROM sessions--"]
        for p in payloads:
            self.assertEqual(Client(self.port).call('/api/login', 'POST', {'username': p, 'password': p})[0], 401, p)
            self.assertIn(Client(self.port).call('/api/user/login', 'POST', {'email': p, 'password': p})[0], (400, 401), p)
            q = urllib.parse.quote(p, safe='')
            for path in (f'/api/houses?area={q}', f'/api/houses?q={q}'):
                status, _, body, _ = raw(self.port, 'GET', path)
                self.assertLess(status, 500, path)
                self.assertNotRegex(body.decode(errors='ignore').lower(), r'sqlite|syntax error|traceback|psycopg')
        a = self.admin()
        self.assertEqual(a.call('/api/admin/houses')[0], 200)  # tabel masih ada

    def test_errors_do_not_leak_internals(self):
        a = self.admin()
        for method, path, body in (('POST', '/api/admin/houses', '{rusak'), ('POST', '/api/login', '[]'), ('GET', '/api/tidak-ada', None), ('POST', '/api/my/applications', 'x')):
            status, _, data, _ = raw(self.port, method, path, {'Content-Type': 'application/json', 'X-CSRF-Token': a.csrf, 'Cookie': '; '.join(f'{k}={v}' for k, v in a.cookies.items())}, body)
            self.assertLess(status, 500, (path, status))
            self.assertNotRegex(data.decode(errors='ignore'), r'Traceback|File "|\.py", line')

    # --- unggahan -------------------------------------------------------------
    def test_upload_rejects_disguised_and_dangerous_files(self):
        t = self.tenant()
        for name, content in (('html', b'<html><script>alert(1)</script></html>'), ('svg', b'<svg onload=alert(1)>'), ('exe', b'MZ\x90\x00'), ('php', b'<?php system($_GET[1]); ?>')):
            body = {'data': base64.b64encode(content).decode(), 'name': f'../../{name}.pdf'}
            self.assertEqual(t.call('/api/my/ktp', 'POST', body)[0], 400, name)
        self.upload(t, '/api/my/ktp')
        stored = t.call('/api/my/ktp')[1]['latest']
        self.assertNotIn('..', stored['url'])
        files = [p for p in app.DATA.rglob('*') if p.is_file() and p.suffix == '.pdf']
        self.assertTrue(all('..' not in str(p.relative_to(app.DATA)) for p in files))

    def test_oversized_body_is_rejected_quickly(self):
        a = self.admin()
        headers = {'Content-Type': 'application/json', 'X-CSRF-Token': a.csrf, 'Content-Length': '999999999', 'Cookie': '; '.join(f'{k}={v}' for k, v in a.cookies.items())}
        try:
            status = raw(self.port, 'POST', '/api/admin/houses', headers, b'{}', timeout=5)[0]
        except (TimeoutError, OSError, http.client.HTTPException):
            self.fail('Server menunggu isi permintaan raksasa (rentan slow-body/DoS)')
        self.assertIn(status, (400, 413))

    # --- brute force ----------------------------------------------------------
    def test_login_is_rate_limited(self):
        statuses = [Client(self.port).call('/api/login', 'POST', {'username': 'adm', 'password': f'salah-{i}'})[0] for i in range(14)]
        self.assertEqual(statuses[0], 401)
        self.assertEqual(statuses[-1], 429)
        statuses = [Client(self.port).call('/api/user/login', 'POST', {'email': 'x@contoh.id', 'password': f'salah-{i}'})[0] for i in range(14)]
        self.assertEqual(statuses[-1], 429)
        # kata sandi benar tetap ditolak saat dibatasi (tidak bisa ditebak lewat perbedaan respons)
        self.assertEqual(Client(self.port).call('/api/login', 'POST', {'username': 'adm', 'password': self.admin_password})[0], 429)


if __name__ == '__main__':
    unittest.main()
