"""Local rental catalog. Python 3.12+, no third-party runtime dependencies."""
import argparse
import base64
import getpass
import hashlib
import hmac
import json
import math
import mimetypes
import os
import re
import secrets
import shutil
import sqlite3
import threading
import time
from datetime import date, datetime, timezone, timedelta
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ROOT = Path(__file__).resolve().parent
for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines() if (ROOT / '.env').exists() else []:
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())
DATA = Path(os.environ.get('DATA_DIR', str(ROOT / 'data'))).resolve()
DB = DATA / 'catalog.sqlite3'
STATUSES = ('Draft', 'Tersedia', 'Dipesan', 'Tersewa')
TRANSITIONS = {'Draft': {'Tersedia'}, 'Tersedia': {'Dipesan', 'Draft'}, 'Dipesan': {'Tersedia', 'Tersewa', 'Draft'}, 'Tersewa': {'Tersedia', 'Draft'}}
WRITE_LOCK = threading.Lock()
RATE_LOCK = threading.Lock()
ATTEMPTS = {}


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


def connect():
    db = sqlite3.connect(DB, timeout=15, factory=ClosingConnection)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


def init_db():
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'uploads').mkdir(exist_ok=True)
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS houses (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE, body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE, filename TEXT NOT NULL, position INTEGER NOT NULL);
        ''')


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def today():
    name = os.environ.get('TIMEZONE', 'Asia/Jakarta')
    try:
        return datetime.now(ZoneInfo(name)).date()
    except ZoneInfoNotFoundError:
        # Windows Python may not bundle IANA timezone data.
        offsets = {'Asia/Jakarta': 7, 'Asia/Bangkok': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9, 'UTC': 0}
        if name not in offsets:
            raise ValueError('Zona waktu membutuhkan paket tzdata atau zona waktu Indonesia/UTC.')
        return datetime.now(timezone(timedelta(hours=offsets[name]))).date()


def lease_notice(house, current=None):
    if house['status'] != 'Tersewa' or not house.get('lease_end'):
        return None
    days = (date.fromisoformat(house['lease_end']) - (current or today())).days
    if days < 0:
        return 'Perlu ditinjau'
    if days <= (7 if house.get('lease_period') == 'monthly' else 30):
        return 'Segera berakhir'
    return None


def config():
    number = os.environ.get('WHATSAPP_NUMBER', '')
    return {
        'name': os.environ.get('BUSINESS_NAME', 'Sewa Aset Perhutani KPH Purwodadi'),
        'profile': os.environ.get('BUSINESS_PROFILE', 'Profil pengelola belum diisi. Silakan lengkapi sebelum peluncuran.'),
        'areas': os.environ.get('SERVICE_AREAS', 'Kawasan layanan belum diisi'),
        'hours': os.environ.get('SERVICE_HOURS', 'Jam layanan belum diisi'),
        'whatsapp': number if re.fullmatch(r'[1-9][0-9]{7,14}', number) else None,
        'whatsapp_display': os.environ.get('WHATSAPP_DISPLAY', '+62 8xx-xxxx-xxxx (nomor contoh)'),
        'timezone': os.environ.get('TIMEZONE', 'Asia/Jakarta'),
    }


def house_record(db, row, admin=False):
    house = json.loads(row['body'])
    house.update(id=row['id'], revision=row['revision'])
    house['photos'] = [dict(id=p['id'], url='/media/' + p['id']) for p in db.execute('SELECT * FROM photos WHERE house_id=? ORDER BY position,id', (row['id'],))]
    if admin:
        house['notice'] = lease_notice(house)
    else:
        for key in ('lease_period', 'lease_start', 'lease_end', 'internal_notes', 'inventory_number', 'asset_condition', 'legal_basis', 'cooperation_type'):
            house.pop(key, None)
    return house


def validate_house(body, previous=None, photo_count=0):
    if not isinstance(body, dict):
        raise ValueError('Data rumah tidak valid.')
    result = {}
    result['asset_type'] = body.get('asset_type', (previous or {}).get('asset_type', 'building'))
    if result['asset_type'] not in ('building', 'land'):
        raise ValueError('Jenis aset tidak valid.')
    for key in ('name', 'code', 'description', 'area', 'address', 'maps_url', 'terms', 'extra_costs', 'internal_notes', 'lease_period', 'lease_start', 'lease_end', 'access', 'land_condition', 'inventory_number', 'asset_condition', 'legal_basis', 'cooperation_type'):
        value = body.get(key, '')
        if not isinstance(value, str) or len(value) > 10000:
            raise ValueError('Isian teks tidak valid: ' + key)
        result[key] = value.strip()
    if result['cooperation_type'] not in ('', 'Sewa 1 tahun', 'Sharing', 'Franchise'):
        raise ValueError('Bentuk kerja tidak valid.')
    if not result['name'] or not result['code']:
        raise ValueError('Nama dan kode rumah wajib diisi.')
    if result['maps_url']:
        parsed = urlparse(result['maps_url'])
        if parsed.scheme != 'https' or parsed.hostname not in ('maps.google.com', 'www.google.com', 'google.com', 'maps.app.goo.gl', 'goo.gl'):
            raise ValueError('Gunakan tautan Google Maps HTTPS.')
    for key in ('land_size', 'building_size', 'bedrooms', 'bathrooms'):
        value = body.get(key, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or value > 100000000:
            raise ValueError('Spesifikasi tidak valid: ' + key)
        if key in ('bedrooms', 'bathrooms') and int(value) != value:
            raise ValueError('Jumlah kamar harus bilangan bulat.')
        result[key] = value
    if result['asset_type'] == 'land':
        result.update(building_size=0, bedrooms=0, bathrooms=0)
    amenities = body.get('amenities', [])
    if not isinstance(amenities, list) or len(amenities) > 50 or any(not isinstance(x, str) or len(x) > 150 for x in amenities):
        raise ValueError('Daftar fasilitas tidak valid.')
    result['amenities'] = [x.strip() for x in amenities if x.strip()]
    if previous and previous.get('demo'):
        result['demo'] = True
    for period in ('monthly', 'yearly'):
        price = body.get(period)
        if price is None:
            result[period] = None
            continue
        if not isinstance(price, dict):
            raise ValueError('Harga tidak valid.')
        amount, minimum = price.get('price'), price.get('minimum')
        if any(isinstance(x, bool) or not isinstance(x, int) or x <= 0 or x > 1000000000000 for x in (amount, minimum)):
            raise ValueError('Harga dan minimum sewa harus bilangan bulat positif.')
        result[period] = {'price': amount, 'minimum': minimum}
    status = body.get('status', 'Draft')
    if status not in STATUSES:
        raise ValueError('Status tidak valid.')
    old_status = previous['status'] if previous else 'Draft'
    if status != old_status:
        if status not in TRANSITIONS[old_status]:
            raise ValueError('Transisi status tidak diizinkan. Ikuti urutan Draft, Tersedia, Dipesan, Tersewa.')
        if body.get('confirm_status') is not True:
            raise ValueError('Konfirmasi perubahan status diperlukan.')
    result['status'] = status
    if status != 'Draft':
        required_sizes = ('land_size', 'building_size') if result['asset_type'] == 'building' else ('land_size',)
        if any(not result[k] for k in ('area', 'address', 'description', 'maps_url')) or any(result[k] <= 0 for k in required_sizes) or photo_count < 1 or not (result['monthly'] or result['yearly']):
            raise ValueError('Lengkapi lokasi, deskripsi, Google Maps, spesifikasi, minimal satu foto dan satu penawaran sebelum publikasi.')
    if status == 'Tersewa':
        period = result['lease_period']
        if period not in ('monthly', 'yearly') or not result[period]:
            raise ValueError('Pilih periode aktif yang ditawarkan rumah.')
        try:
            start, end = date.fromisoformat(result['lease_start']), date.fromisoformat(result['lease_end'])
        except ValueError:
            raise ValueError('Tanggal mulai dan akhir sewa wajib valid.') from None
        if end < start:
            raise ValueError('Tanggal akhir tidak boleh sebelum tanggal mulai.')
    return result


class Handler(BaseHTTPRequestHandler):
    server_version = 'Sewa Aset Perhutani KPH Purwodadi'

    def log_message(self, fmt, *args):
        # Avoid logging credentials and URL query strings.
        print(f'{self.client_address[0]} {self.command} {urlparse(self.path).path} {args[1] if len(args)>1 else ""}')

    def send(self, status, body, content_type='application/json; charset=utf-8', extra=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def session(self):
        jar = cookies.SimpleCookie()
        try:
            jar.load(self.headers.get('Cookie', ''))
            token = jar['session'].value
        except (KeyError, cookies.CookieError):
            return None
        with connect() as db:
            session = db.execute('SELECT * FROM sessions WHERE token_hash=? AND expires>?', (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
        if session and session['csrf'].startswith('demo.') and not self.local_demo_allowed():
            return None
        return session

    def local_demo_allowed(self):
        host = urlparse('http://' + self.headers.get('Host', '')).hostname
        origin = self.headers.get('Origin')
        return (os.environ.get('LOCAL_ADMIN_DEMO', 'false').lower() == 'true'
                and self.client_address[0] in ('127.0.0.1', '::1')
                and host in ('127.0.0.1', 'localhost', '::1')
                and (not origin or urlparse(origin).netloc == self.headers.get('Host')))

    def json_body(self, limit=12000000):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise ValueError('Ukuran permintaan tidak valid.') from None
        if length <= 0 or length > limit:
            raise ValueError('Permintaan kosong atau terlalu besar (maksimal 8 MB per foto).')
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise ValueError('Format permintaan harus JSON.')
        try:
            value = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            raise ValueError('JSON tidak valid.') from None
        if not isinstance(value, dict):
            raise ValueError('Objek JSON diperlukan.')
        return value

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == '/api/config':
                return self.send(200, config())
            if path == '/api/session':
                session = self.session()
                if not session and self.local_demo_allowed():
                    token, csrf = secrets.token_urlsafe(32), 'demo.' + secrets.token_urlsafe(32)
                    with connect() as db:
                        db.execute('DELETE FROM sessions WHERE expires<?', (int(time.time()),))
                        db.execute('INSERT INTO sessions VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), csrf, int(time.time()) + 3600))
                    return self.send(200, {'authenticated': True, 'csrf': csrf}, extra={'Set-Cookie': f'session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600'})
                return self.send(200, {'authenticated': bool(session), 'csrf': session['csrf'] if session else None})
            admin = path.startswith('/api/admin/')
            if admin and not self.session():
                return self.send(401, {'error': 'Silakan login sebagai admin.'})
            if path in ('/api/houses', '/api/admin/houses') or re.fullmatch(r'/api/(?:admin/)?houses/[a-f0-9]+', path):
                with connect() as db:
                    identifier = path.rsplit('/', 1)[-1]
                    rows = db.execute('SELECT * FROM houses' + (' WHERE id=?' if identifier != 'houses' else ''), (identifier,) if identifier != 'houses' else ()).fetchall()
                    result = [house_record(db, row, admin) for row in rows if admin or json.loads(row['body'])['status'] in ('Tersedia', 'Dipesan')]
                if identifier != 'houses':
                    return self.send(200, result[0]) if result else self.send(404, {'error': 'Properti tidak tersedia'})
                result.sort(key=lambda h: (h['status'] != 'Tersedia', h['name']))
                return self.send(200, result)
            if path.startswith('/media/'):
                with connect() as db:
                    photo = db.execute('SELECT p.*,h.body FROM photos p JOIN houses h ON h.id=p.house_id WHERE p.id=?', (path.split('/')[-1],)).fetchone()
                if not photo or (json.loads(photo['body'])['status'] not in ('Tersedia', 'Dipesan') and not self.session()):
                    return self.send(404, {'error': 'Foto tidak tersedia.'})
                file = DATA / 'uploads' / photo['filename']
                return self.send(200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
            if path.startswith('/assets/'):
                file = (ROOT / 'public' / path.lstrip('/')).resolve()
                if not file.is_relative_to(ROOT / 'public' / 'assets') or not file.is_file():
                    return self.send(404, {'error': 'Tidak ditemukan.'})
                return self.send(200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
            if path.startswith('/api/'):
                return self.send(404, {'error': 'Tidak ditemukan.'})
            return self.send(200, (ROOT / 'public' / 'index.html').read_bytes(), 'text/html; charset=utf-8')
        except (ValueError, OSError):
            return self.send(404, {'error': 'Konten tidak tersedia.'})

    def do_POST(self):
        self.mutate('POST')

    def do_PUT(self):
        self.mutate('PUT')

    def do_DELETE(self):
        self.mutate('DELETE')

    def mutate(self, method):
        path = urlparse(self.path).path
        # Same-origin guard supplements SameSite cookies and per-session CSRF tokens.
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'):
            return self.send(403, {'error': 'Asal permintaan tidak diizinkan.'})
        try:
            if path == '/api/login' and method == 'POST':
                return self.login(self.json_body(10000))
            session = self.session()
            if not session:
                return self.send(401, {'error': 'Silakan login sebagai admin.'})
            if not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session['csrf']):
                return self.send(403, {'error': 'Sesi tidak valid. Muat ulang halaman.'})
            if path == '/api/logout':
                with connect() as db:
                    db.execute('DELETE FROM sessions WHERE token_hash=?', (session['token_hash'],))
                return self.send(200, {'ok': True}, extra={'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
            body = self.json_body()
            with WRITE_LOCK, connect() as db:
                if path == '/api/admin/houses' and method == 'POST':
                    value = validate_house(body)
                    identifier = secrets.token_hex(12)
                    db.execute('INSERT INTO houses(id,code,body) VALUES(?,?,?)', (identifier, value['code'], json.dumps(value)))
                    db.commit()
                    return self.send(201, {'id': identifier})
                match = re.fullmatch(r'/api/admin/houses/([a-f0-9]+)(/photos|/photo-order)?', path)
                if not match:
                    return self.send(404, {'error': 'Tidak ditemukan.'})
                identifier, action = match.groups()
                row = db.execute('SELECT * FROM houses WHERE id=?', (identifier,)).fetchone()
                if not row:
                    return self.send(404, {'error': 'Rumah tidak ditemukan.'})
                if not action and method == 'PUT':
                    if body.get('revision') != row['revision']:
                        return self.send(409, {'error': 'Data telah berubah. Muat ulang sebelum menyimpan.'})
                    photo_count = db.execute('SELECT COUNT(*) FROM photos WHERE house_id=?', (identifier,)).fetchone()[0]
                    value = validate_house(body, json.loads(row['body']), photo_count)
                    db.execute('UPDATE houses SET code=?,body=?,revision=revision+1 WHERE id=?', (value['code'], json.dumps(value), identifier))
                    db.commit()
                    return self.send(200, {'ok': True})
                if action == '/photos' and method == 'POST':
                    count = db.execute('SELECT COUNT(*) FROM photos WHERE house_id=?', (identifier,)).fetchone()[0]
                    if count >= 20:
                        raise ValueError('Maksimal 20 foto per rumah.')
                    try:
                        raw = base64.b64decode(body.get('data', ''), validate=True)
                    except (ValueError, TypeError):
                        raise ValueError('Data foto tidak valid.') from None
                    extension = '.jpg' if raw.startswith(b'\xff\xd8\xff') else '.png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else '.webp' if raw.startswith(b'RIFF') and raw[8:12] == b'WEBP' else None
                    if not extension or len(raw) > 8 * 1024 * 1024:
                        raise ValueError('Gunakan foto JPEG, PNG, atau WebP maksimal 8 MB.')
                    photo_id = secrets.token_hex(16)
                    filename = photo_id + extension
                    (DATA / 'uploads' / filename).write_bytes(raw)
                    position = db.execute('SELECT COALESCE(MAX(position),-1)+1 FROM photos WHERE house_id=?', (identifier,)).fetchone()[0]
                    db.execute('INSERT INTO photos VALUES(?,?,?,?)', (photo_id, identifier, filename, position))
                    db.execute('UPDATE houses SET revision=revision+1 WHERE id=?', (identifier,))
                    db.commit()
                    return self.send(201, {'ok': True})
                if action == '/photos' and method == 'DELETE':
                    photos = db.execute('SELECT * FROM photos WHERE house_id=?', (identifier,)).fetchall()
                    if len(photos) <= 1 and json.loads(row['body'])['status'] != 'Draft':
                        raise ValueError('Rumah yang dipublikasikan harus memiliki setidaknya satu foto. Tarik ke Draft terlebih dahulu.')
                    photo = next((p for p in photos if p['id'] == body.get('photo_id')), None)
                    if not photo:
                        raise ValueError('Foto tidak ditemukan.')
                    db.execute('DELETE FROM photos WHERE id=?', (photo['id'],))
                    db.execute('UPDATE houses SET revision=revision+1 WHERE id=?', (identifier,))
                    # Defer file deletion until the database transaction commits.
                    db.commit()
                    (DATA / 'uploads' / photo['filename']).unlink(missing_ok=True)
                    return self.send(200, {'ok': True})
                if action == '/photo-order' and method == 'PUT':
                    ids = body.get('ids', [])
                    actual = [p['id'] for p in db.execute('SELECT id FROM photos WHERE house_id=?', (identifier,))]
                    if not isinstance(ids, list) or len(ids) != len(actual) or set(ids) != set(actual):
                        raise ValueError('Daftar foto berubah. Muat ulang halaman.')
                    for index, photo_id in enumerate(ids):
                        db.execute('UPDATE photos SET position=? WHERE id=?', (index, photo_id))
                    db.execute('UPDATE houses SET revision=revision+1 WHERE id=?', (identifier,))
                    db.commit()
                    return self.send(200, {'ok': True})
                return self.send(405, {'error': 'Metode tidak diizinkan.'})
        except sqlite3.IntegrityError:
            return self.send(400, {'error': 'Kode rumah sudah dipakai.'})
        except (ValueError, TypeError) as error:
            return self.send(400, {'error': str(error)})

    def login(self, body):
        now = time.time()
        address = self.client_address[0]
        with RATE_LOCK:
            attempts = [t for t in ATTEMPTS.get(address, []) if now - t < 900]
            if len(attempts) >= 10:
                return self.send(429, {'error': 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'})
            attempts.append(now)
            ATTEMPTS[address] = attempts
        username, password = body.get('username', ''), body.get('password', '')
        if not isinstance(username, str) or not isinstance(password, str):
            raise ValueError('Isian login tidak valid.')
        with connect() as db:
            admin = db.execute('SELECT * FROM admin WHERE id=1').fetchone()
            computed = password_hash(password, admin['salt'] if admin else '00' * 16)
            if not admin or not hmac.compare_digest(computed, admin['password_hash']) or username != admin['username']:
                return self.send(401, {'error': 'Nama pengguna atau kata sandi salah.'})
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            db.execute('DELETE FROM sessions WHERE expires<?', (int(now),))
            db.execute('INSERT INTO sessions VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), csrf, int(now + 8 * 3600)))
        with RATE_LOCK:
            ATTEMPTS.pop(address, None)
        secure = '; Secure' if os.environ.get('COOKIE_SECURE', 'false').lower() == 'true' else ''
        return self.send(200, {'authenticated': True, 'csrf': csrf}, extra={'Set-Cookie': f'session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}'})


def main():
    parser = argparse.ArgumentParser(description='Website penyewaan rumah lokal')
    parser.add_argument('command', choices=['serve', 'init', 'create-admin', 'seed-demo', 'backup'], nargs='?', default='serve')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8000)))
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--output', help='Folder cadangan baru')
    args = parser.parse_args()
    init_db()
    if args.command == 'init':
        print('Database diinisialisasi.')
    elif args.command == 'create-admin':
        with connect() as db:
            if db.execute('SELECT id FROM admin').fetchone():
                raise SystemExit('Satu akun admin sudah tersedia. Tidak ada akun baru dibuat.')
            username = input('Nama pengguna admin: ').strip()
            password = getpass.getpass('Kata sandi (minimal 12 karakter): ')
            if not username or len(password) < 12 or password != getpass.getpass('Ulangi kata sandi: '):
                raise SystemExit('Nama pengguna/kata sandi tidak valid atau konfirmasi berbeda.')
            salt = secrets.token_hex(16)
            db.execute('INSERT INTO admin VALUES(1,?,?,?)', (username, salt, password_hash(password, salt)))
        print('Akun admin berhasil dibuat.')
    elif args.command == 'seed-demo':
        from seed import seed_demo
        seed_demo()
    elif args.command == 'backup':
        if not args.output:
            raise SystemExit('Gunakan --output dengan folder cadangan baru. Hentikan server terlebih dahulu.')
        destination = Path(args.output).resolve()
        if destination.exists() or destination.is_relative_to(DATA):
            raise SystemExit('Gunakan folder baru di luar direktori data.')
        destination.mkdir(parents=True)
        with connect() as source, sqlite3.connect(destination / DB.name, factory=ClosingConnection) as target:
            source.backup(target)
        shutil.copytree(DATA / 'uploads', destination / 'uploads')
        print('Cadangan database dan foto selesai.')
    else:
        if os.environ.get('LOCAL_ADMIN_DEMO', 'false').lower() == 'true' and args.host not in ('127.0.0.1', 'localhost', '::1'):
            raise SystemExit('Mode demo admin hanya boleh dijalankan pada localhost.')
        today()  # Validate timezone at startup.
        server = ThreadingHTTPServer((args.host, args.port), Handler)
        print(f'Local: http://{args.host}:{args.port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == '__main__':
    main()
