import base64
import copy
import http.client
import json
import secrets
import tempfile
import threading
import unittest
from datetime import date, timedelta
from pathlib import Path

import app
import seed


class RentalTests(unittest.TestCase):
    def test_asset_types_and_publication_requirements(self):
        building = {'name':'Bangunan uji','code':'ASSET-TYPE','status':'Tersedia',
                    'confirm_status':True,'area':'Kawasan uji','address':'Alamat uji',
                    'description':'Data uji','maps_url':'https://www.google.com/maps',
                    'land_size':150,'building_size':80,'bedrooms':0,'bathrooms':0,
                    'monthly':{'price':1000000,'minimum':1}}
        self.assertEqual(app.validate_house(building, photo_count=1)['asset_type'], 'building')
        land = dict(building, asset_type='land', building_size=0,
                    access='Jalan lingkungan', land_condition='Lahan datar')
        result = app.validate_house(land, photo_count=1)
        self.assertEqual(result['building_size'], 0)
        self.assertEqual(result['access'], 'Jalan lingkungan')
        with self.assertRaises(ValueError):
            app.validate_house(dict(building, asset_type='invalid'), photo_count=1)
        with self.assertRaises(ValueError):
            app.validate_house(dict(building, building_size=0), photo_count=1)
        with self.assertRaises(ValueError):
            app.validate_house(dict(land, land_size=0), photo_count=1)

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.original_data, cls.original_db = app.DATA, app.DB
        app.DATA = Path(cls.temp.name)
        app.DB = app.DATA / 'catalog.sqlite3'
        app.init_db()
        seed.seed_demo()
        cls.password = secrets.token_urlsafe(24)
        salt = secrets.token_hex(16)
        with app.connect() as db:
            db.execute('INSERT INTO admin VALUES(1,?,?,?)', ('test-admin', salt, app.password_hash(cls.password, salt)))
        cls.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        app.DATA, app.DB = cls.original_data, cls.original_db
        cls.temp.cleanup()

    def request(self, path, method='GET', body=None, auth=False, csrf=True, extra=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        headers = {'Content-Type': 'application/json'}
        if auth:
            headers['Cookie'] = self.cookie
            if csrf:
                headers['X-CSRF-Token'] = self.csrf
        headers.update(extra or {})
        conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
        response = conn.getresponse()
        raw = response.read()
        result = json.loads(raw) if 'application/json' in response.getheader('Content-Type', '') else raw
        status, returned_headers = response.status, dict(response.getheaders())
        conn.close()
        return status, result, returned_headers

    def login(self):
        status, result, headers = self.request('/api/login', 'POST', {'username': 'test-admin', 'password': self.password})
        self.assertEqual(status, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.csrf = result['csrf']
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])

    def draft(self):
        house = {'name': 'Rumah uji', 'code': 'TEST-'+secrets.token_hex(5), 'status': 'Draft'}
        status, result, _ = self.request('/api/admin/houses', 'POST', house, True)
        self.assertEqual(status, 201, result)
        return self.request('/api/admin/houses/'+result['id'], auth=True)[1]

    def save(self, house, expected=200):
        status, result, _ = self.request('/api/admin/houses/'+house['id'], 'PUT', house, True)
        self.assertEqual(status, expected, result)
        return self.request('/api/admin/houses/'+house['id'], auth=True)[1]

    def test_public_visibility_and_internal_redaction(self):
        status, houses, _ = self.request('/api/houses')
        self.assertEqual(status, 200)
        self.assertTrue(houses)
        self.assertTrue(all(h['status'] in ('Tersedia', 'Dipesan') for h in houses))
        for house in houses:
            for key in ('lease_start', 'lease_end', 'lease_period', 'internal_notes'):
                self.assertNotIn(key, house)
        self.login()
        all_houses = self.request('/api/admin/houses', auth=True)[1]
        for house in all_houses:
            if house['status'] in ('Draft', 'Tersewa'):
                self.assertEqual(self.request('/api/houses/'+house['id'])[0], 404)
                self.assertEqual(self.request(house['photos'][0]['url'])[0], 404)
                self.assertEqual(self.request(house['photos'][0]['url'], auth=True)[0], 200)

    def test_unauthorized_and_csrf(self):
        self.assertEqual(self.request('/api/admin/houses')[0], 401)
        self.assertEqual(self.request('/api/admin/houses', 'POST', {'name': 'X'})[0], 401)
        self.login()
        self.assertEqual(self.request('/api/admin/houses', 'POST', {}, True, False)[0], 403)
        self.assertEqual(self.request('/api/admin/houses', 'POST', {}, True, extra={'Origin': 'https://attacker.invalid'})[0], 403)
        self.assertEqual(self.request('/assets/../../.env')[0], 404)
        self.assertEqual(self.request('/api/login', 'POST', {'username': 'wrong', 'password': 'wrong'})[0], 401)

    def test_status_lifecycle_and_photos(self):
        self.login()
        house = self.draft()
        house.update(status='Tersedia', confirm_status=True)
        self.save(house, 400)
        # Valid 1x1 PNG, persisted and accessed through the authorization-aware media route.
        png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
        endpoint = '/api/admin/houses/'+house['id']
        for _ in range(2):
            self.assertEqual(self.request(endpoint+'/photos', 'POST', {'data': png}, True)[0], 201)
        self.assertEqual(self.request(endpoint+'/photos', 'POST', {'data': base64.b64encode(b'<svg onload="alert(1)">').decode()}, True)[0], 400)
        house = self.request(endpoint, auth=True)[1]
        photos = house['photos']
        self.assertEqual(self.request(endpoint+'/photo-order', 'PUT', {'ids': [p['id'] for p in reversed(photos)]}, True)[0], 200)
        house = self.request(endpoint, auth=True)[1]
        self.assertEqual(house['photos'][0]['id'], photos[1]['id'])
        house.update(status='Tersedia', confirm_status=True, description='Contoh', area='Uji', address='Alamat uji', maps_url='https://www.google.com/maps', land_size=90, building_size=60, bedrooms=2, bathrooms=1, monthly={'price': 1000000, 'minimum': 3}, yearly={'price': 10000000, 'minimum': 1})
        house = self.save(house)
        self.assertEqual(self.request('/api/houses/'+house['id'])[0], 200)
        house.update(status='Tersewa', confirm_status=True)
        self.save(house, 400)  # No skipping DP verification.
        house['status'] = 'Dipesan'
        house = self.save(house)
        self.assertEqual(self.request('/api/houses/'+house['id'])[1]['status'], 'Dipesan')
        house.update(status='Tersedia', confirm_status=True)
        house = self.save(house)  # Cancellation resolved manually.
        house.update(status='Dipesan', confirm_status=True)
        house = self.save(house)
        house.update(status='Tersewa', confirm_status=True)
        self.save(house, 400)  # Requires lease dates and active period.
        house.update(lease_period='monthly', lease_start='2026-01-01', lease_end='2026-12-31')
        house = self.save(house)
        self.assertEqual(self.request('/api/houses/'+house['id'])[0], 404)
        self.assertEqual(self.request(photos[0]['url'])[0], 404)
        house['lease_end'] = '2027-01-31'
        house = self.save(house)
        self.assertEqual(house['status'], 'Tersewa')
        house.update(status='Tersedia', confirm_status=True)
        house = self.save(house)
        public = self.request('/api/houses/'+house['id'])[1]
        self.assertNotIn('lease_end', public)
        self.assertEqual(self.request(endpoint+'/photos', 'DELETE', {'photo_id': photos[0]['id']}, True)[0], 200)
        self.assertEqual(self.request(endpoint+'/photos', 'DELETE', {'photo_id': photos[1]['id']}, True)[0], 400)
        house = self.request(endpoint, auth=True)[1]
        house.update(status='Draft', confirm_status=True)
        self.save(house)
        self.assertEqual(self.request(endpoint+'/photos', 'DELETE', {'photo_id': photos[1]['id']}, True)[0], 200)

    def test_lease_notice_boundaries(self):
        current = date(2026, 10, 30)
        for period, boundary in [('monthly', 7), ('yearly', 30)]:
            for offset, expected in [(-1, 'Perlu ditinjau'), (0, 'Segera berakhir'), (boundary, 'Segera berakhir'), (boundary+1, None)]:
                house = {'status': 'Tersewa', 'lease_period': period, 'lease_end': (current+timedelta(days=offset)).isoformat()}
                self.assertEqual(app.lease_notice(house, current), expected)
                self.assertEqual(house['status'], 'Tersewa')

    def test_revision_conflict_and_logout(self):
        self.login()
        house = self.draft()
        stale = copy.deepcopy(house)
        house['name'] = 'Updated'
        self.save(house)
        self.save(stale, 409)
        self.assertEqual(self.request('/api/logout', 'POST', {}, True)[0], 200)
        self.assertEqual(self.request('/api/admin/houses', auth=True)[0], 401)

    def test_validation_and_confirmation(self):
        house = {'name': 'Test', 'code': 'UNIQUE', 'status': 'Tersedia'}
        with self.assertRaises(ValueError):
            app.validate_house(house)
        for value in (0, -1, 1.2, True):
            with self.assertRaises(ValueError):
                app.validate_house({'name': 'Test', 'code': 'X', 'monthly': {'price': value, 'minimum': 1}})
        with self.assertRaises(ValueError):
            app.validate_house({'name': 'Test', 'code': 'X', 'maps_url': 'javascript:alert(1)'})

    def test_whatsapp_default_disabled(self):
        # Test the default placeholder behavior without relying on a fictitious number.
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, {'WHATSAPP_NUMBER': ''}):
            self.assertIsNone(app.config()['whatsapp'])

    def test_local_demo_scope_and_disable(self):
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, {'LOCAL_ADMIN_DEMO': 'false'}):
            self.assertFalse(self.request('/api/session')[1]['authenticated'])
        with patch.dict(os.environ, {'LOCAL_ADMIN_DEMO': 'true'}):
            self.assertFalse(self.request('/api/session', extra={'Host': 'example.invalid'})[1]['authenticated'])
            self.assertFalse(self.request('/api/session', extra={'Origin': 'https://example.invalid'})[1]['authenticated'])
            status, session, headers = self.request('/api/session')
            self.assertEqual(status, 200)
            self.assertTrue(session['authenticated'])
            self.cookie = headers['Set-Cookie'].split(';')[0]
            self.csrf = session['csrf']
            self.assertEqual(self.request('/api/admin/houses', auth=True)[0], 200)
            self.assertEqual(self.request('/api/admin/houses', 'POST', {}, True, False)[0], 403)
        with patch.dict(os.environ, {'LOCAL_ADMIN_DEMO': 'false'}):
            self.assertEqual(self.request('/api/admin/houses', auth=True)[0], 401)


if __name__ == '__main__':
    unittest.main()
