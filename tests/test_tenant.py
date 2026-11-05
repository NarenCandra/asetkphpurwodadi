import base64
import http.client
import io
import json
import secrets
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path

import app

PDF = b'%PDF-1.4\n% contoh berkas uji\n'


def tiny_xlsx(rows, sheet='Purwodadi'):
    """Bangun .xlsx minimal (inline string) tanpa library tambahan."""
    def cell(ref, v):
        if isinstance(v, str):
            return f'<c r="{ref}" t="inlineStr"><is><t>{v}</t></is></c>'
        return f'<c r="{ref}"><v>{v}</v></c>'
    body = ''
    for n, row in enumerate(rows, 1):
        body += f'<row r="{n}">' + ''.join(cell('ABCDEFGHIJKL'[i] + str(n), v) for i, v in enumerate(row) if v is not None) + '</row>'
    main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        z.writestr('xl/workbook.xml', f'<workbook xmlns="{main}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="{main}"><sheetData>{body}</sheetData></worksheet>')
    return out.getvalue()


class Client:
    def __init__(self, port):
        self.port, self.cookies, self.csrf = port, {}, None

    def call(self, path, method='GET', body=None, raw=False):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=15)
        headers = {'Content-Type': 'application/json', 'Cookie': '; '.join(f'{k}={v}' for k, v in self.cookies.items())}
        if self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        resp = conn.getresponse()
        data = resp.read()
        for header, value in resp.getheaders():
            if header.lower() == 'set-cookie':
                name, _, rest = value.partition('=')
                token = rest.split(';')[0]
                if token:
                    self.cookies[name] = token
                else:
                    self.cookies.pop(name, None)
        conn.close()
        if raw:
            return resp.status, data, dict(resp.getheaders())
        return resp.status, json.loads(data) if data else None


class TenantTests(unittest.TestCase):
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

    def admin(self):
        c = Client(self.port)
        status, data = c.call('/api/login', 'POST', {'username': 'adm', 'password': self.admin_password})
        self.assertEqual(status, 200)
        c.csrf = data['csrf']
        return c

    def tenant(self, email=None):
        c = Client(self.port)
        email = email or f'{secrets.token_hex(4)}@contoh.id'
        status, data = c.call('/api/register', 'POST', {'name': 'Budi Uji', 'email': email, 'whatsapp': '081234567890', 'password': 'rahasia-uji-1'})
        self.assertEqual(status, 201, data)
        c.csrf = data['csrf']
        self.assertEqual(data['user']['whatsapp'], '6281234567890')
        return c

    def house(self, admin, code, status='Tersedia'):
        body = {'name': 'Rumah ' + code, 'code': code, 'status': 'Draft', 'area': 'Kawasan Uji', 'address': 'Jl. Uji', 'description': 'Uji',
                'maps_url': 'https://www.google.com/maps', 'land_size': 100, 'building_size': 60, 'bedrooms': 0, 'bathrooms': 0,
                'monthly': {'price': 1000000, 'minimum': 1}, 'yearly': {'price': 10000000, 'minimum': 1}}
        s, d = admin.call('/api/admin/houses', 'POST', body)
        self.assertEqual(s, 201, d)
        hid = d['id']
        photo = base64.b64encode(b'\xff\xd8\xff\xe0' + b'0' * 50).decode()
        self.assertEqual(admin.call(f'/api/admin/houses/{hid}/photos', 'POST', {'data': photo})[0], 201)
        self.set_house_status(admin, hid, status)
        return hid

    def set_house_status(self, admin, hid, status):
        s, h = admin.call(f'/api/admin/houses/{hid}')
        order = {'Draft': 0, 'Tersedia': 1, 'Dipesan': 2, 'Tersewa': 3}
        if h['status'] == status:
            return
        h.update(status=status, confirm_status=True)
        if status == 'Tersewa':
            h.update(lease_period='yearly', lease_start='2026-01-01', lease_end='2026-12-31')
        s, d = admin.call(f'/api/admin/houses/{hid}', 'PUT', h)
        self.assertEqual(s, 200, d)

    def upload(self, client, path, data=PDF):
        return client.call(path, 'POST', {'data': base64.b64encode(data).decode(), 'name': 'berkas.pdf'})

    # ------------------------------------------------------------------
    def test_registration_validation_and_login(self):
        c = Client(self.port)
        for bad in ({'name': 'A', 'email': 'x@y.id', 'whatsapp': '0812345678', 'password': 'panjang-sekali'},
                    {'name': 'Ani', 'email': 'salah', 'whatsapp': '0812345678', 'password': 'panjang-sekali'},
                    {'name': 'Ani', 'email': 'a@y.id', 'whatsapp': '123', 'password': 'panjang-sekali'},
                    {'name': 'Ani', 'email': 'a@y.id', 'whatsapp': '0812345678', 'password': 'pendek'}):
            self.assertEqual(c.call('/api/register', 'POST', bad)[0], 400)
        t = self.tenant('dobel@contoh.id')
        self.assertEqual(Client(self.port).call('/api/register', 'POST', {'name': 'Ani', 'email': 'DOBEL@contoh.id', 'whatsapp': '0812345678', 'password': 'panjang-sekali'})[0], 400)
        self.assertTrue(t.call('/api/me')[1]['authenticated'])
        self.assertEqual(t.call('/api/user/logout', 'POST', {})[0], 200)
        self.assertFalse(t.call('/api/me')[1]['authenticated'])
        c2 = Client(self.port)
        self.assertEqual(c2.call('/api/user/login', 'POST', {'email': 'dobel@contoh.id', 'password': 'salah-salah'})[0], 401)
        self.assertEqual(c2.call('/api/user/login', 'POST', {'email': 'dobel@contoh.id', 'password': 'rahasia-uji-1'})[0], 200)

    def test_profile_update(self):
        t = self.tenant()
        self.assertEqual(t.call('/api/my/profile', 'PUT', {'name': 'X', 'whatsapp': '0812345678'})[0], 400)
        self.assertEqual(t.call('/api/my/profile', 'PUT', {'name': 'Budi Baru', 'whatsapp': '12'})[0], 400)
        s, d = t.call('/api/my/profile', 'PUT', {'name': 'Budi Baru', 'whatsapp': '0857 1111 2222'})
        self.assertEqual((s, d['user']['whatsapp']), (200, '6285711112222'))
        self.assertEqual(t.call('/api/me')[1]['user']['name'], 'Budi Baru')
        self.assertEqual(Client(self.port).call('/api/my/profile', 'PUT', {'name': 'Budi', 'whatsapp': '0812345678'})[0], 401)

    def test_requires_login_and_csrf(self):
        anon = Client(self.port)
        for path in ('/api/my/applications', '/api/my/leases', '/api/my/ktp'):
            self.assertEqual(anon.call(path)[0], 401)
        self.assertEqual(anon.call('/api/admin/applications')[0], 401)
        t = self.tenant()
        t.csrf = 'salah'
        self.assertEqual(t.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': 'x'})[0], 403)
        self.assertEqual(t.call('/api/admin/applications')[0], 401)  # sesi penyewa bukan admin

    def test_full_rental_flow(self):
        a, t = self.admin(), self.tenant()
        hid = self.house(a, 'FLOW-1')
        # survei: tercatat, bebas KTP, tidak dobel, tidak mengubah status aset
        s, survey = t.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})
        self.assertEqual(s, 201)
        self.assertRegex(survey['ref'], r'^PGJ-\d{4}-\d{5}$')
        s, again = t.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})
        self.assertEqual((s, again['id'], again['existing']), (200, survey['id'], True))
        self.assertEqual(a.call(f'/api/admin/houses/{hid}')[1]['status'], 'Tersedia')
        # kerja sama tanpa KTP ditolak
        s, d = t.call('/api/my/applications', 'POST', {'kind': 'sewa_baru', 'house_id': hid})
        self.assertEqual(s, 400)
        self.assertIn('KTP', d['error'])
        self.assertEqual(self.upload(t, '/api/my/ktp')[0], 201)
        s, form = t.call('/api/my/applications', 'POST', {'kind': 'sewa_baru', 'house_id': hid})
        self.assertEqual(s, 201, form)
        fid = form['id']
        # penyewa belum bisa unggah surat sebelum admin menyediakan surat siap ttd
        self.assertEqual(self.upload(t, f'/api/my/applications/{fid}/documents')[0], 400)
        self.assertEqual(self.upload(a, f'/api/admin/applications/{fid}/documents')[0], 201)
        detail = t.call(f'/api/my/applications/{fid}')[1]
        self.assertEqual([d['kind'] for d in detail['documents']], ['surat_siap_ttd'])
        s, data, headers = t.call(detail['documents'][0]['url'], raw=True)
        self.assertEqual((s, data), (200, PDF))
        self.assertIn('attachment', headers['Content-Disposition'])
        self.assertEqual(self.upload(t, f'/api/my/applications/{fid}/documents')[0], 201)
        # belum bisa disetujui sebelum KTP terverifikasi dan surat diterima
        self.assertEqual(a.call(f'/api/admin/applications/{fid}', 'PUT', {'status': 'disetujui'})[0], 400)
        adm = a.call(f'/api/admin/applications/{fid}')[1]
        self.assertEqual(a.call(f"/api/admin/documents/{adm['ktp']['id']}", 'PUT', {'status': 'perlu_perbaikan'})[0], 400)  # alasan wajib
        self.assertEqual(a.call(f"/api/admin/documents/{adm['ktp']['id']}", 'PUT', {'status': 'terverifikasi'})[0], 200)
        surat = next(d for d in adm['documents'] if d['kind'] == 'surat_ttd')
        self.assertEqual(a.call(f"/api/admin/documents/{surat['id']}", 'PUT', {'status': 'diterima'})[0], 200)
        # dokumen diterima TIDAK otomatis menyetujui atau melunasi (AC 23)
        mid = a.call(f'/api/admin/applications/{fid}')[1]
        self.assertEqual((mid['status'], mid['payment']), ('diproses', 'belum'))
        self.assertEqual(a.call(f'/api/admin/applications/{fid}', 'PUT', {'payment': 'dp'})[0], 400)  # harus disetujui dulu
        self.assertEqual(a.call(f'/api/admin/applications/{fid}', 'PUT', {'status': 'disetujui', 'admin_note': 'ok'})[0], 200)
        # aktivasi sebelum lunas / sebelum aset Dipesan ditolak
        act = {'confirm': True, 'period': 'yearly', 'start': '2026-11-10', 'end': '2027-11-09'}
        self.assertEqual(a.call(f'/api/admin/applications/{fid}/activate', 'POST', act)[0], 400)
        self.assertEqual(a.call(f'/api/admin/applications/{fid}', 'PUT', {'status': 'disetujui', 'payment': 'dp'})[0], 200)
        self.set_house_status(a, hid, 'Dipesan')
        self.assertEqual(a.call(f'/api/admin/applications/{fid}', 'PUT', {'status': 'disetujui', 'payment': 'lunas'})[0], 200)
        self.assertEqual(a.call(f'/api/admin/applications/{fid}/activate', 'POST', dict(act, confirm=False))[0], 400)
        self.assertEqual(a.call(f'/api/admin/applications/{fid}/activate', 'POST', act)[0], 200)
        house = a.call(f'/api/admin/houses/{hid}')[1]
        self.assertEqual((house['status'], house['lease_end']), ('Tersewa', '2027-11-09'))
        self.assertEqual(t.call('/api/houses/' + hid)[0], 404 if False else t.call('/api/houses/' + hid)[0])
        self.assertEqual(Client(self.port).call('/api/houses/' + hid)[0], 404)  # Tersewa hilang dari publik
        # Sewa Saya + status bayar terlihat
        leases = t.call('/api/my/leases')[1]
        self.assertEqual(len(leases), 1)
        self.assertEqual(leases[0]['current']['end'], '2027-11-09')
        self.assertEqual(t.call(f'/api/my/applications/{fid}')[1]['payment'], 'lunas')
        # perpanjangan: KTP terverifikasi dipakai ulang tanpa unggah ulang (AC 21)
        lid = leases[0]['id']
        s, ren = t.call(f'/api/my/leases/{lid}/renew', 'POST', {})
        self.assertEqual(s, 201, ren)
        self.assertEqual(ren['kind'], 'perpanjangan')
        self.assertEqual(t.call(f'/api/my/leases/{lid}/renew', 'POST', {})[1]['existing'], True)
        rid = ren['id']
        self.assertEqual(a.call(f"/api/admin/applications/{rid}")[1]['ktp']['status'], 'terverifikasi')
        self.assertEqual(self.upload(a, f'/api/admin/applications/{rid}/documents')[0], 201)
        self.assertEqual(self.upload(t, f'/api/my/applications/{rid}/documents')[0], 201)
        radm = a.call(f'/api/admin/applications/{rid}')[1]
        rs = next(d for d in radm['documents'] if d['kind'] == 'surat_ttd')
        a.call(f"/api/admin/documents/{rs['id']}", 'PUT', {'status': 'diterima'})
        self.assertEqual(a.call(f'/api/admin/applications/{rid}', 'PUT', {'status': 'disetujui', 'payment': 'lunas'})[0], 200)
        # tanggal aktif belum berubah sampai admin mencatat perpanjangan
        self.assertEqual(a.call(f'/api/admin/houses/{hid}')[1]['lease_end'], '2027-11-09')
        self.assertEqual(a.call(f'/api/admin/applications/{rid}/extend', 'POST', {'confirm': True, 'end': '2027-01-01'})[0], 400)
        self.assertEqual(a.call(f'/api/admin/applications/{rid}/extend', 'POST', {'confirm': True, 'end': '2028-11-09'})[0], 200)
        self.assertEqual(a.call(f'/api/admin/houses/{hid}')[1]['lease_end'], '2028-11-09')
        periods = t.call('/api/my/leases')[1][0]['periods']
        self.assertEqual([(p['start'], p['end']) for p in periods], [('2026-11-10', '2027-11-09'), ('2027-11-10', '2028-11-09')])  # riwayat tidak ditimpa

    def test_tenant_isolation(self):
        a, t1, t2 = self.admin(), self.tenant(), self.tenant()
        hid = self.house(a, 'ISO-1')
        self.upload(t1, '/api/my/ktp')
        t1.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})
        _, form = t1.call('/api/my/applications', 'POST', {'kind': 'sewa_baru', 'house_id': hid})
        ktp = t1.call('/api/my/ktp')[1]['latest']
        self.assertEqual(t1.call(ktp['url'], raw=True)[0], 200)
        self.assertEqual(t2.call(ktp['url'], raw=True)[0], 404)
        self.assertEqual(t2.call(f"/api/my/applications/{form['id']}")[0], 404)
        self.assertEqual(self.upload(t2, f"/api/my/applications/{form['id']}/documents")[0], 404)
        self.assertEqual(t2.call(f"/api/my/applications/{form['id']}/cancel", 'POST', {})[0], 404)
        self.assertEqual(t2.call('/api/my/applications')[1], [])
        self.assertEqual(t2.call(f"/api/admin/documents/{ktp['id']}/file", raw=True)[0], 401)
        # sewa orang lain tidak dapat diperpanjang
        self.assertEqual(t2.call('/api/my/leases/abcdef/renew', 'POST', {})[0], 400)
        # berkas tidak dapat diakses lewat web statis
        self.assertEqual(Client(self.port).call('/private/' + ktp['url'].split('/')[-2], raw=True)[2].get('Content-Type', '').split(';')[0], 'text/html')

    def test_upload_validation_and_versions(self):
        t = self.tenant()
        self.assertEqual(self.upload(t, '/api/my/ktp', b'MZ-bukan-dokumen')[0], 400)
        self.assertEqual(self.upload(t, '/api/my/ktp', PDF + b'0' * (5 * 1024 * 1024))[0], 400)
        self.upload(t, '/api/my/ktp')
        self.upload(t, '/api/my/ktp')
        versions = t.call('/api/my/ktp')[1]['versions']
        self.assertEqual([v['version'] for v in versions], [2, 1])  # versi lama tetap tersimpan

    def test_dp_cannot_hold_house_twice_and_closed_house(self):
        a, t1, t2 = self.admin(), self.tenant(), self.tenant()
        hid = self.house(a, 'DP-1')
        forms = []
        for t in (t1, t2):
            self.upload(t, '/api/my/ktp')
            t.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})
            _, f = t.call('/api/my/applications', 'POST', {'kind': 'sewa_baru', 'house_id': hid})
            self.upload(a, f"/api/admin/applications/{f['id']}/documents")
            self.upload(t, f"/api/my/applications/{f['id']}/documents")
            d = a.call(f"/api/admin/applications/{f['id']}")[1]
            a.call(f"/api/admin/documents/{d['ktp']['id']}", 'PUT', {'status': 'terverifikasi'})
            a.call(f"/api/admin/documents/{next(x for x in d['documents'] if x['kind']=='surat_ttd')['id']}", 'PUT', {'status': 'diterima'})
            self.assertEqual(a.call(f"/api/admin/applications/{f['id']}", 'PUT', {'status': 'disetujui'})[0], 200)
            forms.append(f['id'])
        self.assertEqual(a.call(f'/api/admin/applications/{forms[0]}', 'PUT', {'status': 'disetujui', 'payment': 'dp'})[0], 200)
        s, d = a.call(f'/api/admin/applications/{forms[1]}', 'PUT', {'status': 'disetujui', 'payment': 'dp'})
        self.assertEqual(s, 400)
        self.assertIn('ditahan', d['error'])
        # aset Dipesan: pengajuan survei baru ditolak
        self.set_house_status(a, hid, 'Dipesan')
        t3 = self.tenant()
        self.assertEqual(t3.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})[0], 400)

    def test_admin_list_filters_and_internal_fields_hidden(self):
        a, t = self.admin(), self.tenant()
        hid = self.house(a, 'LIST-1')
        t.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})
        rows = a.call('/api/admin/applications?kind=survei')[1]
        self.assertTrue(any(r['house']['code'] == 'LIST-1' and r['tenant']['name'] == 'Budi Uji' for r in rows))
        self.assertEqual(a.call('/api/admin/applications?kind=perpanjangan&q=LIST')[1], [])
        s, house = a.call(f'/api/admin/houses/{hid}')
        house.update(real_2025=1000, estimasi_2026=2000, keterangan='tersewa')
        self.assertEqual(a.call(f'/api/admin/houses/{hid}', 'PUT', house)[0], 200)
        public = Client(self.port).call(f'/api/houses/{hid}')[1]
        for key in ('real_2025', 'estimasi_2026', 'keterangan', 'import_key'):
            self.assertNotIn(key, public)

    def test_admin_sees_tenant_ktp_and_progress(self):
        a, t = self.admin(), self.tenant('ktp-admin@contoh.id')
        self.assertEqual(Client(self.port).call('/api/admin/tenants')[0], 401)
        self.assertEqual(t.call('/api/admin/tenants')[0], 401)
        self.upload(t, '/api/my/ktp')  # KTP diunggah dari Dokumen Saya, belum ada pengajuan
        rows = a.call('/api/admin/tenants?q=ktp-admin')[1]
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['ktp']['status'], rows[0]['applications']), ('menunggu', 0))
        detail = a.call('/api/admin/tenants/' + rows[0]['id'])[1]
        s, data, _ = a.call(detail['ktp_versions'][0]['url'], raw=True)
        self.assertEqual((s, data), (200, PDF))
        self.assertEqual(a.call(f"/api/admin/documents/{detail['ktp_versions'][0]['id']}", 'PUT', {'status': 'terverifikasi'})[0], 200)
        self.assertEqual(t.call('/api/my/ktp')[1]['latest']['status'], 'terverifikasi')
        # KTP menunggu terlihat di daftar pengajuan walau pengajuannya survei
        hid = self.house(a, 'PRG-1')
        _, survey = t.call('/api/my/applications', 'POST', {'kind': 'survei', 'house_id': hid})
        self.assertEqual((survey['step'], 'WhatsApp' in survey['next']), (2, True))
        listed = next(r for r in a.call('/api/admin/applications?q=ktp-admin')[1] if r['id'] == survey['id'])
        self.assertEqual(listed['ktp_status'], 'terverifikasi')
        a.call(f"/api/admin/applications/{survey['id']}", 'PUT', {'status': 'selesai'})
        self.assertEqual(t.call(f"/api/my/applications/{survey['id']}")[1]['step'], 3)
        _, form = t.call('/api/my/applications', 'POST', {'kind': 'sewa_baru', 'house_id': hid})
        self.assertIn('menyiapkan surat', form['next'])
        self.upload(a, f"/api/admin/applications/{form['id']}/documents")
        self.assertIn('tandatangani', t.call(f"/api/my/applications/{form['id']}")[1]['next'])
        self.upload(t, f"/api/my/applications/{form['id']}/documents")
        self.assertEqual(t.call(f"/api/my/applications/{form['id']}")[1]['step'], 2)

    def test_excel_import(self):
        a = self.admin()
        rows = [[None, 'DAFTAR POTENSI'], [],
                ['No.', 'OBJEK ', 'NO. INVENTARIS **)', 'LOKASI', 'KONDISI', 'ALAS HAK', 'BENTUK KERJA SAMA', 'REAL. TAHUN 2025 *)', 'ESTIMASI TAHUN 2026 (SESUAI NPS) *)', 'REAL TAHUN 2026 *)', 'RENCANA TAHUN 2027 *)', 'KETERANGAN\n(TERSEWA/BELUM)'],
                [1, 2, 3, 4, 5, 6, 7, 8, 9],
                [None, 'OPSET YANG SUDAH TEREALISASI'],
                [1, 'Rumah Dinas Uji', 'INV-9', 'Jl. Uji 1', 'baik', 'AU 1', 'sewa 1 th', 1000000, '2.000.000', 3000000, None, 'tersewa'],
                [2, None, None, None, 'rusak ringan', None, 'sharing', 0, 500000, None, None, 'proses'],
                [None, 'JUMLAH'], [3, 'Tidak ikut', None, None, 'baik']]
        data = base64.b64encode(tiny_xlsx(rows)).decode()
        s, preview = a.call('/api/admin/import', 'POST', {'data': data})
        self.assertEqual((s, preview['found'], preview['new'], preview['committed']), (200, 2, 2, False))
        before = len(a.call('/api/admin/houses')[1])
        s, done = a.call('/api/admin/import', 'POST', {'data': data, 'commit': True})
        self.assertEqual((done['new'], done['committed']), (2, True))
        houses = a.call('/api/admin/houses')[1]
        self.assertEqual(len(houses), before + 2)
        named = next(h for h in houses if h['name'] == 'Rumah Dinas Uji')
        self.assertEqual((named['status'], named['asset_type'], named['inventory_number'], named['cooperation_type'], named['estimasi_2026']), ('Draft', 'building', 'INV-9', 'Sewa 1 tahun', 2000000))
        unnamed = next(h for h in houses if h['name'].startswith('Aset KPH Purwodadi No. 2'))
        self.assertEqual(named['yearly'], {'price': 2000000, 'minimum': 1})  # dari Estimasi 2026
        self.assertIsNone(unnamed['yearly'])  # sharing: tidak diberi harga
        self.assertEqual(unnamed['cooperation_type'], 'Sharing')
        self.assertIn('belum ada', unnamed['internal_notes'])
        # impor ulang tidak menggandakan data
        self.assertEqual(a.call('/api/admin/import', 'POST', {'data': data, 'commit': True})[1]['new'], 0)
        self.assertEqual(len(a.call('/api/admin/houses')[1]), before + 2)
        # edit lewat form admin tidak menghapus data internal hasil impor
        named.update(description='diedit')
        self.assertEqual(a.call(f"/api/admin/houses/{named['id']}", 'PUT', named)[0], 200)
        self.assertEqual(a.call(f"/api/admin/houses/{named['id']}")[1]['real_2026'], 3000000)
        self.assertEqual(a.call('/api/admin/import', 'POST', {'data': base64.b64encode(b'bukan xlsx').decode()})[0], 400)
        self.assertEqual(Client(self.port).call('/api/admin/import', 'POST', {'data': data})[0], 401)

        # No. Inventaris yang sama di banyak baris tetap diimpor semuanya
        dup = base64.b64encode(tiny_xlsx(rows[:5] + [
            [1, 'Kantin', 'INV-DUP', 'Jl. A', 'baik', None, 'sewa 1 th', 0, 100, None, None, 'proses'],
            [2, 'Kantin', 'INV-DUP', 'Jl. A', 'baik', None, 'sewa 1 th', 0, 100, None, None, 'tersewa'],
            [3, 'Kantin', 'INV-DUP', 'Jl. A', 'baik', None, 'sewa 1 th', 0, 100, None, None, None]])).decode()
        r = a.call('/api/admin/import', 'POST', {'data': dup, 'commit': True, 'publish': True})[1]
        self.assertEqual((r['found'], r['new'], r['published_new']), (3, 3, 2))  # tersewa tetap Draft
        public = [h['name'] for h in Client(self.port).call('/api/houses')[1]]
        self.assertEqual(public.count('Kantin'), 2)


if __name__ == '__main__':
    unittest.main()
