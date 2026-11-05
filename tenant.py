"""Akun penyewa, pengajuan, berkas privat, sewa/perpanjangan, dan impor Excel.

Hanya library standar Python. Modul ini tidak meng-import app.py; objek modul
app diberikan lewat parameter A agar tes yang mengganti app.DATA/app.DB tetap benar.
"""
import base64
import hashlib
import hmac
import io
import json
import re
import secrets
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from http import cookies
from urllib.parse import parse_qs, urlparse

SCHEMA = '''
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, whatsapp TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, house_id TEXT NOT NULL REFERENCES houses(id), user_id TEXT NOT NULL REFERENCES users(id), application_id TEXT, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lease_periods (id TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE, application_id TEXT, period TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, ref TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), house_id TEXT NOT NULL REFERENCES houses(id), lease_id TEXT REFERENCES leases(id), status TEXT NOT NULL DEFAULT 'diproses', admin_note TEXT NOT NULL DEFAULT '', payment TEXT NOT NULL DEFAULT 'belum', payment_note TEXT NOT NULL DEFAULT '', ktp_doc_id TEXT, closed INTEGER NOT NULL DEFAULT 0, applied INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), application_id TEXT REFERENCES applications(id), kind TEXT NOT NULL, filename TEXT NOT NULL, original_name TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_app_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_user ON documents(user_id, kind);
'''

KINDS = ('survei', 'sewa_baru', 'perpanjangan')
STATUSES = ('diproses', 'terjadwal', 'selesai', 'perlu_perbaikan', 'disetujui', 'ditolak', 'dibatalkan')
SURVEY_ONLY = {'terjadwal', 'selesai'}
FORM_ONLY = {'perlu_perbaikan', 'disetujui'}
PAYMENTS = ('belum', 'dp', 'lunas')
DOC_STATUS = {'ktp': ('menunggu', 'terverifikasi', 'perlu_perbaikan'), 'surat_ttd': ('menunggu', 'diterima', 'perlu_perbaikan')}
MAX_DOC = 5 * 1024 * 1024
EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$')
INTERNAL_KEYS = ('lease_period', 'lease_start', 'lease_end', 'internal_notes', 'inventory_number', 'asset_condition', 'legal_basis', 'cooperation_type', 'real_2025', 'estimasi_2026', 'real_2026', 'rencana_2027', 'keterangan', 'import_key')


def init(db):
    db.executescript(SCHEMA)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class Denied(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------- sesi ---
def user_session(A, h):
    jar = cookies.SimpleCookie()
    try:
        jar.load(h.headers.get('Cookie', ''))
        token = jar['usession'].value
    except (KeyError, cookies.CookieError):
        return None
    with A.connect() as db:
        return db.execute('SELECT s.token_hash,s.csrf,u.id AS uid,u.name,u.email,u.whatsapp FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?', (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()


def cookie(A, token, max_age):
    secure = '; Secure' if A.os.environ.get('COOKIE_SECURE', 'false').lower() == 'true' else ''
    return {'Set-Cookie': f'usession={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={max_age}{secure}'}


def user_json(row):
    return {'id': row['uid'], 'name': row['name'], 'email': row['email'], 'whatsapp': row['whatsapp']}


def rate_limit(A, h, bucket):
    key = f'{bucket}:{A.client_ip(h)}'
    t = time.time()
    with A.RATE_LOCK:
        attempts = [x for x in A.ATTEMPTS.get(key, []) if t - x < 900]
        if len(attempts) >= 10:
            raise Denied(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.')
        attempts.append(t)
        A.ATTEMPTS[key] = attempts
    return key


def start_session(A, h, db, user_row_id, name, email, whatsapp, status=200):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.execute('DELETE FROM user_sessions WHERE expires<?', (int(time.time()),))
    db.execute('INSERT INTO user_sessions VALUES(?,?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), csrf, int(time.time()) + 8 * 3600, user_row_id))
    return status, {'authenticated': True, 'csrf': csrf, 'user': {'id': user_row_id, 'name': name, 'email': email, 'whatsapp': whatsapp}}, cookie(A, token, 28800)


def clean_whatsapp(value):
    wa = re.sub(r'[\s\-+]', '', str(value))
    if wa.startswith('0'):
        wa = '62' + wa[1:]
    if not re.fullmatch(r'62[0-9]{8,13}', wa):
        raise ValueError('Nomor WhatsApp tidak valid. Contoh: 0812xxxxxxx.')
    return wa


def register(A, h, body):
    key = rate_limit(A, h, 'reg')
    name, email, password = (body.get(k, '') for k in ('name', 'email', 'password'))
    if not all(isinstance(x, str) for x in (name, email, password)):
        raise ValueError('Isian pendaftaran tidak valid.')
    name, email = name.strip(), email.strip().lower()
    if not 2 <= len(name) <= 100:
        raise ValueError('Nama wajib diisi (2-100 karakter).')
    if not EMAIL.match(email):
        raise ValueError('Email tidak valid.')
    if not 8 <= len(password) <= 200:
        raise ValueError('Kata sandi minimal 8 karakter.')
    wa = clean_whatsapp(body.get('whatsapp', ''))
    salt = secrets.token_hex(16)
    uid = secrets.token_hex(12)
    with A.WRITE_LOCK, A.connect() as db:
        if db.execute('SELECT 1 FROM users WHERE lower(email)=lower(?)', (email,)).fetchone():
            raise ValueError('Email sudah terdaftar. Silakan masuk.')
        db.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?)', (uid, email, name, wa, salt, A.password_hash(password, salt), now()))
        status, payload, extra = start_session(A, h, db, uid, name, email, wa, 201)
    with A.RATE_LOCK:
        A.ATTEMPTS.pop(key, None)
    h.send(status, payload, extra=extra)  # setelah commit


def user_login(A, h, body):
    key = rate_limit(A, h, 'ulogin')
    email, password = body.get('email', ''), body.get('password', '')
    if not isinstance(email, str) or not isinstance(password, str):
        raise ValueError('Isian login tidak valid.')
    with A.connect() as db:
        user = db.execute('SELECT * FROM users WHERE lower(email)=lower(?)', (email.strip(),)).fetchone()
        computed = A.password_hash(password, user['salt'] if user else '00' * 16)
        if not user or not hmac.compare_digest(computed, user['password_hash']):
            raise Denied(401, 'Email atau kata sandi salah.')
        status, payload, extra = start_session(A, h, db, user['id'], user['name'], user['email'], user['whatsapp'])
    with A.RATE_LOCK:
        A.ATTEMPTS.pop(key, None)
    h.send(status, payload, extra=extra)  # setelah commit


# ---------------------------------------------------------------- berkas ---
def read_upload(body):
    try:
        raw = base64.b64decode(body.get('data', ''), validate=True)
    except (ValueError, TypeError):
        raise ValueError('Data berkas tidak valid.') from None
    ext = 'pdf' if raw.startswith(b'%PDF-') else 'jpg' if raw.startswith(b'\xff\xd8\xff') else 'png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else None
    if not ext or not raw or len(raw) > MAX_DOC:
        raise ValueError('Gunakan berkas PDF, JPG, atau PNG maksimal 5 MB.')
    name = re.sub(r'[^\w.\- ]', '', str(body.get('name', 'berkas'))).strip()[:100] or 'berkas'
    return raw, ext, name


def add_document(A, db, user_id, application_id, kind, upload):
    raw, ext, name = upload
    if application_id is None:
        version = db.execute('SELECT COALESCE(MAX(version),0)+1 FROM documents WHERE user_id=? AND application_id IS NULL AND kind=?', (user_id, kind)).fetchone()[0]
    else:
        version = db.execute('SELECT COALESCE(MAX(version),0)+1 FROM documents WHERE user_id=? AND application_id=? AND kind=?', (user_id, application_id, kind)).fetchone()[0]
    doc_id = secrets.token_hex(16)
    filename = f'{user_id}/{doc_id}.{ext}'
    A.storage.put(A.DATA, 'private', filename, raw, {'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'png': 'image/png'}[ext])
    status = 'tersedia' if kind == 'surat_siap_ttd' else 'menunggu'
    db.execute('INSERT INTO documents(id,user_id,application_id,kind,filename,original_name,version,status,created) VALUES(?,?,?,?,?,?,?,?,?)', (doc_id, user_id, application_id, kind, filename, name, version, status, now()))
    return doc_id


def doc_json(row, admin):
    base = '/api/admin' if admin else '/api/my'
    return {'id': row['id'], 'kind': row['kind'], 'version': row['version'], 'status': row['status'], 'reason': row['reason'], 'name': row['original_name'], 'created': row['created'], 'url': f"{base}/documents/{row['id']}/file", 'application_id': row['application_id']}


def latest(db, user_id, kind, application_id=None):
    if application_id is None:
        return db.execute('SELECT * FROM documents WHERE user_id=? AND kind=? AND application_id IS NULL ORDER BY version DESC LIMIT 1', (user_id, kind)).fetchone()
    return db.execute('SELECT * FROM documents WHERE application_id=? AND kind=? ORDER BY version DESC LIMIT 1', (application_id, kind)).fetchone()


def progress(db, row):
    """(langkah, teks tindakan berikutnya) untuk tampilan alur penyewa."""
    kind, status = row['kind'], row['status']
    if status in ('ditolak', 'dibatalkan'):
        return 0, 'Pengajuan ditutup.' if status == 'dibatalkan' else 'Pengajuan ditolak. Lihat catatan pengelola.'
    if kind == 'survei':
        text = {'diproses': 'Lanjutkan ke WhatsApp dengan nomor referensi untuk menyepakati jadwal survei.', 'terjadwal': 'Survei sudah dijadwalkan pengelola. Jika setelah survei Anda sepakat, lanjutkan ke permohonan sewa.', 'selesai': 'Survei selesai. Jika sepakat, lanjutkan ke permohonan sewa.'}
        return {'diproses': 2, 'terjadwal': 3, 'selesai': 3}.get(status, 2), text.get(status, '')
    if row['applied']:
        return 4, 'Sewa aktif. Lihat periode di Sewa Saya.'
    if status == 'disetujui':
        if row['payment'] == 'lunas':
            return 3, 'Pelunasan dikonfirmasi. Menunggu pengelola mengaktifkan sewa.' if kind == 'sewa_baru' else 'Pelunasan dikonfirmasi. Menunggu pengelola mencatat perpanjangan.'
        if row['payment'] == 'dp':
            return 3, 'DP dikonfirmasi. Lanjutkan pelunasan melalui WhatsApp.'
        return 3, 'Disetujui. Lanjutkan ke WhatsApp untuk pembayaran.'
    ktp = db.execute('SELECT * FROM documents WHERE id=?', (row['ktp_doc_id'],)).fetchone() if row['ktp_doc_id'] else None
    template, signed = latest(db, row['user_id'], 'surat_siap_ttd', row['id']), latest(db, row['user_id'], 'surat_ttd', row['id'])
    if ktp and ktp['status'] == 'perlu_perbaikan':
        return 1, 'Perbaiki KTP: ' + (ktp['reason'] or 'lihat catatan pengelola') + '.'
    if status == 'perlu_perbaikan':
        return 1, 'Perbaiki berkas: ' + (row['admin_note'] or 'lihat catatan pengelola') + '.'
    if not template:
        return 1, 'Menunggu pengelola menyiapkan surat siap tanda tangan.'
    if not signed:
        return 1, 'Unduh surat, tandatangani di luar website, lalu unggah hasilnya.'
    if signed['status'] == 'perlu_perbaikan':
        return 1, 'Perbaiki surat: ' + (signed['reason'] or 'lihat catatan pengelola') + '.'
    return 2, 'Berkas lengkap. Menunggu verifikasi pengelola.'


def serve_file(A, h, doc):
    try:
        raw = A.storage.get(A.DATA, 'private', doc['filename'])
    except FileNotFoundError:
        raise Denied(404, 'Berkas tidak tersedia.') from None
    extension = doc['filename'].rsplit('.', 1)[-1]
    ctype = {'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'png': 'image/png'}[extension]
    h.send(200, raw, ctype, {'Content-Disposition': f'attachment; filename="{doc["kind"]}-v{doc["version"]}.{extension}"'})


# ---------------------------------------------------------- pengajuan ---
def house_brief(db, house_id):
    row = db.execute('SELECT id,body FROM houses WHERE id=?', (house_id,)).fetchone()
    if not row:
        return None
    b = json.loads(row['body'])
    return {'id': row['id'], 'code': b.get('code'), 'name': b.get('name'), 'status': b.get('status'), 'area': b.get('area'), 'monthly': b.get('monthly'), 'yearly': b.get('yearly')}


def app_json(db, row, admin=False):
    data = {k: row[k] for k in ('id', 'ref', 'kind', 'status', 'payment', 'closed', 'applied', 'created', 'updated', 'lease_id')}
    data['admin_note'] = row['admin_note']
    data['payment_note'] = row['payment_note']
    data['house'] = house_brief(db, row['house_id'])
    data['step'], data['next'] = progress(db, row)
    if admin:
        u = db.execute('SELECT name,email,whatsapp FROM users WHERE id=?', (row['user_id'],)).fetchone()
        data['tenant'] = dict(u)
    return data


def create_application(A, db, user, body):
    kind = body.get('kind')
    if kind not in KINDS:
        raise ValueError('Jenis pengajuan tidak valid.')
    uid = user['uid']
    lease_id = None
    if kind == 'perpanjangan':
        lease = db.execute('SELECT * FROM leases WHERE id=? AND user_id=?', (body.get('lease_id'), uid)).fetchone()
        if not lease:
            raise ValueError('Sewa tidak ditemukan.')
        lease_id, house_id = lease['id'], lease['house_id']
    else:
        house_id = body.get('house_id')
    house = house_brief(db, house_id) if isinstance(house_id, str) else None
    if not house:
        raise ValueError('Aset tidak ditemukan.')
    if kind != 'perpanjangan' and house['status'] != 'Tersedia':
        raise ValueError('Aset ini tidak sedang tersedia untuk diajukan.')
    if kind == 'survei':
        existing = db.execute("SELECT * FROM applications WHERE user_id=? AND house_id=? AND kind='survei' AND status IN ('diproses','terjadwal')", (uid, house_id)).fetchone()
        if existing:
            return existing, False
    else:
        existing = db.execute("SELECT * FROM applications WHERE user_id=? AND house_id=? AND kind=? AND closed=0", (uid, house_id, kind)).fetchone()
        if existing:
            return existing, False
        if kind == 'sewa_baru' and not db.execute("SELECT 1 FROM applications WHERE user_id=? AND house_id=? AND kind='survei' AND status NOT IN ('ditolak','dibatalkan')", (uid, house_id)).fetchone():
            raise ValueError('Ajukan dan lakukan survei terlebih dahulu sebelum mengajukan kerja sama.')
        ktp = latest(db, uid, 'ktp')
        if not ktp or ktp['status'] == 'perlu_perbaikan':
            raise ValueError('Unggah KTP yang jelas terlebih dahulu di Dokumen Saya.')
    count = db.execute("SELECT COUNT(*) FROM applications WHERE ref LIKE ?", (f'PGJ-{date.today().year}-%',)).fetchone()[0] + 1
    ref = f'PGJ-{date.today().year}-{count:05d}'
    while db.execute('SELECT 1 FROM applications WHERE ref=?', (ref,)).fetchone():
        count += 1
        ref = f'PGJ-{date.today().year}-{count:05d}'
    ktp_id = None
    if kind != 'survei':
        ktp_id = latest(db, uid, 'ktp')['id']
    app_id = secrets.token_hex(12)
    db.execute('INSERT INTO applications(id,ref,kind,user_id,house_id,lease_id,ktp_doc_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)', (app_id, ref, kind, uid, house_id, lease_id, ktp_id, now(), now()))
    return db.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone(), True


def app_detail(A, db, row, admin):
    data = app_json(db, row, admin)
    docs = db.execute('SELECT * FROM documents WHERE application_id=? ORDER BY kind,version', (row['id'],)).fetchall()
    data['documents'] = [doc_json(d, admin) for d in docs]
    ktp = db.execute('SELECT * FROM documents WHERE id=?', (row['ktp_doc_id'],)).fetchone() if row['ktp_doc_id'] else None
    data['ktp'] = doc_json(ktp, admin) if ktp else None
    if admin:
        data['ktp_versions'] = [doc_json(d, True) for d in db.execute("SELECT * FROM documents WHERE user_id=? AND kind='ktp' ORDER BY version", (row['user_id'],))]
    if row['lease_id']:
        data['lease_periods'] = [dict(period=p['period'], start=p['start_date'], end=p['end_date']) for p in db.execute('SELECT * FROM lease_periods WHERE lease_id=? ORDER BY start_date', (row['lease_id'],))]
    return data


def admin_update_application(A, db, row, body):
    status = body.get('status', row['status'])
    note = body.get('admin_note', row['admin_note'])
    payment = body.get('payment', row['payment'])
    pnote = body.get('payment_note', row['payment_note'])
    if status not in STATUSES or payment not in PAYMENTS or not isinstance(note, str) or not isinstance(pnote, str) or len(note) > 2000 or len(pnote) > 2000:
        raise ValueError('Data pengajuan tidak valid.')
    kind = row['kind']
    if row['applied']:
        raise ValueError('Pengajuan ini sudah diaktifkan menjadi sewa dan tidak dapat diubah.')
    if (kind != 'survei' and status in SURVEY_ONLY) or (kind == 'survei' and status in FORM_ONLY):
        raise ValueError('Status tidak sesuai dengan jenis pengajuan.')
    if kind == 'survei' and (payment != 'belum'):
        raise ValueError('Pembayaran tidak berlaku untuk survei.')
    if status == 'perlu_perbaikan' and not note.strip():
        raise ValueError('Tuliskan alasan perbaikan pada catatan admin.')
    if status == 'disetujui' and row['status'] != 'disetujui':
        ktp = db.execute('SELECT * FROM documents WHERE id=?', (row['ktp_doc_id'],)).fetchone()
        surat = latest(db, row['user_id'], 'surat_ttd', row['id'])
        if not ktp or ktp['status'] != 'terverifikasi':
            raise ValueError('KTP harus terverifikasi sebelum pengajuan disetujui.')
        if not surat or surat['status'] != 'diterima':
            raise ValueError('Surat bertanda tangan harus berstatus Diterima sebelum pengajuan disetujui.')
    if payment != 'belum' and status != 'disetujui':
        raise ValueError('Pembayaran hanya dapat dikonfirmasi setelah pengajuan disetujui.')
    if payment in ('dp', 'lunas') and payment != row['payment']:
        clash = db.execute("SELECT ref FROM applications WHERE house_id=? AND id!=? AND kind='sewa_baru' AND closed=0 AND payment IN ('dp','lunas')", (row['house_id'], row['id'])).fetchone()
        if kind == 'sewa_baru' and clash:
            raise ValueError(f"Aset ini sudah ditahan oleh pengajuan lain ({clash['ref']}).")
    closed = 1 if status in ('ditolak', 'dibatalkan') else 0
    db.execute('UPDATE applications SET status=?,admin_note=?,payment=?,payment_note=?,closed=?,updated=? WHERE id=?', (status, note.strip(), payment, pnote.strip(), closed, now(), row['id']))


def lease_json(db, lease):
    house = house_brief(db, lease['house_id'])
    periods = [dict(period=p['period'], start=p['start_date'], end=p['end_date']) for p in db.execute('SELECT * FROM lease_periods WHERE lease_id=? ORDER BY start_date,end_date', (lease['id'],))]
    last = periods[-1] if periods else None
    return {'id': lease['id'], 'house': house, 'periods': periods, 'current': last, 'open_renewal': bool(db.execute("SELECT 1 FROM applications WHERE lease_id=? AND kind='perpanjangan' AND closed=0", (lease['id'],)).fetchone())}


def write_house_lease(db, house_id, **changes):
    row = db.execute('SELECT body,revision FROM houses WHERE id=?', (house_id,)).fetchone()
    body = json.loads(row['body'])
    body.update(changes)
    db.execute('UPDATE houses SET body=?,revision=revision+1 WHERE id=?', (json.dumps(body), house_id))


def iso(value, label):
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        raise ValueError(f'{label} tidak valid.') from None


def activate(A, db, row, body):
    if row['kind'] != 'sewa_baru' or row['status'] != 'disetujui' or row['payment'] != 'lunas' or row['closed'] or row['applied']:
        raise ValueError('Sewa hanya dapat diaktifkan dari pengajuan sewa baru yang disetujui dan pelunasannya sudah dikonfirmasi.')
    if body.get('confirm') is not True:
        raise ValueError('Konfirmasi aktivasi sewa diperlukan.')
    period = body.get('period')
    start, end = iso(body.get('start'), 'Tanggal mulai'), iso(body.get('end'), 'Tanggal akhir')
    if end < start:
        raise ValueError('Tanggal akhir tidak boleh sebelum tanggal mulai.')
    house = house_brief(db, row['house_id'])
    if period not in ('monthly', 'yearly') or not house[period]:
        raise ValueError('Pilih periode yang ditawarkan aset ini.')
    if house['status'] != 'Dipesan':
        raise ValueError('Ubah status aset menjadi Dipesan (setelah DP) sebelum mengaktifkan sewa.')
    lease_id = secrets.token_hex(12)
    db.execute('INSERT INTO leases VALUES(?,?,?,?,?)', (lease_id, row['house_id'], row['user_id'], row['id'], now()))
    db.execute('INSERT INTO lease_periods VALUES(?,?,?,?,?,?,?)', (secrets.token_hex(12), lease_id, row['id'], period, start, end, now()))
    write_house_lease(db, row['house_id'], status='Tersewa', lease_period=period, lease_start=start, lease_end=end)
    db.execute('UPDATE applications SET lease_id=?,closed=1,applied=1,updated=? WHERE id=?', (lease_id, now(), row['id']))
    return lease_id


def extend(A, db, row, body):
    if row['kind'] != 'perpanjangan' or row['status'] != 'disetujui' or row['payment'] != 'lunas' or row['closed'] or row['applied'] or not row['lease_id']:
        raise ValueError('Perpanjangan hanya dapat dicatat dari pengajuan perpanjangan yang disetujui dan pelunasannya sudah dikonfirmasi.')
    if body.get('confirm') is not True:
        raise ValueError('Konfirmasi perpanjangan diperlukan.')
    last = db.execute('SELECT * FROM lease_periods WHERE lease_id=? ORDER BY end_date DESC LIMIT 1', (row['lease_id'],)).fetchone()
    period = body.get('period', last['period'])
    if period not in ('monthly', 'yearly'):
        raise ValueError('Periode tidak valid.')
    end = iso(body.get('end'), 'Tanggal akhir baru')
    start = iso(body.get('start') or (date.fromisoformat(last['end_date']) + timedelta(days=1)).isoformat(), 'Tanggal mulai')
    if end <= last['end_date'] or end < start:
        raise ValueError('Tanggal akhir baru harus setelah tanggal akhir sebelumnya.')
    db.execute('INSERT INTO lease_periods VALUES(?,?,?,?,?,?,?)', (secrets.token_hex(12), row['lease_id'], row['id'], period, start, end, now()))
    house = house_brief(db, row['house_id'])
    if house and house['status'] == 'Tersewa':
        write_house_lease(db, row['house_id'], lease_period=period, lease_end=end)
    db.execute('UPDATE applications SET closed=1,applied=1,updated=? WHERE id=?', (now(), row['id']))


# ------------------------------------------------------------- impor Excel ---
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def parse_xml(raw):
    if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
        raise ValueError('Berkas Excel tidak aman.')
    return ET.fromstring(raw)


def col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group()
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xlsx(raw, sheet=None):
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise ValueError('Berkas bukan file .xlsx yang valid.') from None
    if sum(i.file_size for i in z.infolist()) > 80 * 1024 * 1024:
        raise ValueError('Berkas Excel terlalu besar.')
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in parse_xml(z.read('xl/sharedStrings.xml')).iter(NS + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    rels = {r.get('Id'): r.get('Target') for r in parse_xml(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = []
    for s in parse_xml(z.read('xl/workbook.xml')).iter(NS + 'sheet'):
        target = rels.get(s.get(RNS + 'id'), '')
        sheets.append((s.get('name'), target.lstrip('/') if target.startswith('/') else 'xl/' + target))
    if not sheets:
        raise ValueError('Berkas Excel tidak memiliki lembar kerja.')
    chosen = next((s for s in sheets if s[0] == sheet), None) if sheet else None
    if sheet and not chosen:
        raise ValueError('Lembar kerja tidak ditemukan.')
    chosen = chosen or next((s for s in sheets if 'purwodadi' in s[0].lower() and 'rekap' not in s[0].lower()), sheets[0])
    rows = []
    for row in parse_xml(z.read(chosen[1])).iter(NS + 'row'):
        cells = {}
        for c in row.iter(NS + 'c'):
            kind, v = c.get('t'), c.find(NS + 'v')
            if kind == 's' and v is not None:
                value = shared[int(v.text)]
            elif kind == 'inlineStr':
                value = ''.join(t.text or '' for t in c.iter(NS + 't'))
            elif v is not None and v.text is not None:
                value = v.text
                if kind not in ('str', 'b', 'e'):
                    try:
                        value = float(value)
                        value = int(value) if value == int(value) else value
                    except ValueError:
                        pass
            else:
                continue
            cells[col_index(c.get('r'))] = value
        rows.append((int(row.get('r')), cells))
    return [s[0] for s in sheets], chosen[0], rows


def number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value) if value >= 0 else None
    if isinstance(value, str) and re.fullmatch(r'\d{1,3}(\.\d{3})+|\d+', value.strip()):
        return int(value.strip().replace('.', ''))
    return None


HEADER_RULES = (('objek', ('OBJEK',)), ('inventory_number', ('NO. INVENTARIS', 'NO INVENTARIS')), ('lokasi', ('LOKASI',)), ('kondisi', ('KONDISI',)), ('alas_hak', ('ALAS HAK',)), ('bentuk', ('BENTUK KERJA SAMA',)), ('real_2025', ('REAL. TAHUN 2025', 'REAL TAHUN 2025')), ('estimasi_2026', ('ESTIMASI',)), ('real_2026', ('REAL. TAHUN 2026', 'REAL TAHUN 2026')), ('rencana_2027', ('RENCANA',)), ('keterangan', ('KETERANGAN',)))
HEADERS = {key: key for key, _ in HEADER_RULES}


def extract_records(rows):
    header = next(((n, cells) for n, cells in rows if any(isinstance(v, str) and v.strip().upper().startswith('OBJEK') for v in cells.values())), None)
    if not header:
        raise ValueError('Baris judul kolom (OBJEK, NO. INVENTARIS, ...) tidak ditemukan.')
    cols = {}
    for index, text in header[1].items():
        if isinstance(text, str):
            normal = ' '.join(text.upper().split())
            for key, prefixes in HEADER_RULES:
                if key not in cols and normal.startswith(prefixes):
                    cols[key] = index
                    break
    if 'objek' not in cols:
        raise ValueError('Kolom OBJEK tidak ditemukan.')
    records, section = [], ''
    for number_row, cells in rows:
        if number_row <= header[0]:
            continue
        first = cells.get(0)
        if first is None and 'JUMLAH' in ' '.join(str(cells.get(1, '')).upper().split()):
            break
        if first == 1 and cells.get(1) == 2 and cells.get(2) == 3:
            continue  # baris penomoran kolom (1, 2, 3, ...)
        if isinstance(first, (int, float)) and not isinstance(first, bool) and any(cells.get(i) not in (None, '') for i in cols.values()):
            rec = {'row': number_row, 'no': int(first), 'section': section}
            for key, index in cols.items():
                value = cells.get(index)
                rec[key] = value.strip() if isinstance(value, str) else value
            records.append(rec)
        elif first is None and isinstance(cells.get(1), str) and cells[1].strip():
            section = cells[1].strip()
    return records


def record_to_house(rec, code):
    raw_bentuk = str(rec.get('bentuk') or '').strip()
    low = raw_bentuk.lower()
    coop = 'Sewa 1 tahun' if low.startswith('sewa') and '1' in low else 'Sharing' if low.startswith('sharing') else 'Franchise' if low.startswith('franchise') else ''
    notes = ['Diimpor dari Excel baris %s%s.' % (rec['row'], f" ({rec['section']})" if rec.get('section') else '')]
    name = str(rec.get('objek') or '').strip()
    if not name:
        name = f"Aset KPH Purwodadi No. {rec['no']}"
        notes.append('Nama objek, lokasi, atau No. Inventaris belum ada di Excel: lengkapi sebelum publikasi.')
    if raw_bentuk and not coop:
        notes.append(f'Bentuk kerja sama pada Excel: {raw_bentuk}.')
    kond = str(rec.get('kondisi') or '').strip()
    yearly = None
    ket = rec.get('keterangan')
    values = {k: number(rec.get(k)) for k in ('real_2025', 'estimasi_2026', 'real_2026', 'rencana_2027')}
    if coop == 'Sewa 1 tahun' and values['estimasi_2026']:
        yearly = {'price': values['estimasi_2026'], 'minimum': 1}
        notes.append('Harga sewa tahunan diisi dari Estimasi 2026 pada Excel; sesuaikan bila perlu.')
    for k in values:
        if values[k] is None and rec.get(k) not in (None, ''):
            notes.append(f'{k} pada Excel: {rec[k]}.')
    return {'asset_type': 'building', 'name': name, 'code': code, 'description': '', 'area': '', 'address': str(rec.get('lokasi') or '').strip(), 'maps_url': '', 'terms': '', 'extra_costs': '', 'internal_notes': ' '.join(notes), 'lease_period': '', 'lease_start': '', 'lease_end': '', 'access': '', 'land_condition': '', 'inventory_number': str(rec.get('inventory_number') or '').strip(), 'asset_condition': kond[:1].upper() + kond[1:], 'legal_basis': str(rec.get('alas_hak') or '').strip(), 'cooperation_type': coop, 'land_size': 0, 'building_size': 0, 'bedrooms': 0, 'bathrooms': 0, 'amenities': [], 'monthly': None, 'yearly': yearly, 'status': 'Draft', 'keterangan': str(ket).strip() if ket not in (None, '') else '', **{k: v for k, v in values.items()}, 'import_key': hashlib.sha256(json.dumps([rec.get(k) for k in sorted(HEADERS)] + [rec['row']], default=str).encode()).hexdigest()[:24]}


def available(keterangan):
    """Baris yang belum tersewa/terikat kerja sama lain boleh langsung ditayangkan."""
    text = str(keterangan or '').strip().lower()
    return text == '' or text.startswith(('proses', 'belum'))


def import_excel(A, body):
    raw = base64.b64decode(body.get('data', ''), validate=True) if isinstance(body.get('data'), str) else b''
    if not raw or len(raw) > 10 * 1024 * 1024:
        raise ValueError('Pilih berkas .xlsx (maksimal 10 MB).')
    sheets, sheet, rows = read_xlsx(raw, body.get('sheet') or None)
    records = extract_records(rows)
    commit, publish = body.get('commit') is True, body.get('publish') is True
    with A.WRITE_LOCK, A.connect() as db:
        existing = db.execute('SELECT id,code,body FROM houses').fetchall()
        by_key = {}
        for r in existing:
            b = json.loads(r['body'])
            if b.get('import_key'):
                by_key[b['import_key']] = (r['id'], b)
        # Satu No. Inventaris boleh muncul di banyak baris, jadi hanya baris yang sama persis yang dilewati.
        numbers = [int(m.group(1)) for r in existing if (m := re.fullmatch(r'PWD-(\d+)', r['code'], re.I))]
        seq = max(numbers, default=0)
        created, skipped, shown_new, shown_old, priced_old, preview = 0, 0, 0, 0, 0, []
        for rec in records:
            house = record_to_house(rec, 'PWD-%03d' % (seq + 1))
            eligible = publish and available(house['keterangan'])
            if house['import_key'] in by_key:
                skipped += 1
                rid, old = by_key[house['import_key']]
                if commit and house['yearly'] and old.get('yearly') is None and str(old.get('internal_notes', '')).startswith('Diimpor dari Excel'):
                    old['yearly'] = house['yearly']
                    old['internal_notes'] = old['internal_notes'] + ' Harga sewa tahunan diisi dari Estimasi 2026 pada Excel; sesuaikan bila perlu.'
                    db.execute('UPDATE houses SET body=?,revision=revision+1 WHERE id=?', (json.dumps(old), rid))
                    priced_old += 1
                if eligible and old.get('status') == 'Draft' and str(old.get('internal_notes', '')).startswith('Diimpor dari Excel'):
                    shown_old += 1
                    if commit:
                        old['status'] = 'Tersedia'
                        db.execute('UPDATE houses SET body=?,revision=revision+1 WHERE id=?', (json.dumps(old), rid))
                continue
            seq += 1
            by_key[house['import_key']] = (None, house)
            if eligible:
                house['status'] = 'Tersedia'
                shown_new += 1
            created += 1
            if len(preview) < 8:
                preview.append({k: house[k] for k in ('code', 'name', 'address', 'inventory_number', 'asset_condition', 'cooperation_type', 'real_2025', 'estimasi_2026', 'real_2026', 'keterangan', 'status')})
            if commit:
                db.execute('INSERT INTO houses(id,code,body) VALUES(?,?,?)', (secrets.token_hex(12), house['code'], json.dumps(house)))
    return {'sheets': sheets, 'sheet': sheet, 'found': len(records), 'new': created, 'skipped': skipped, 'published_new': shown_new, 'published_existing': shown_old, 'priced_existing': priced_old, 'committed': commit, 'preview': preview}


# --------------------------------------------------------------- routing ---
def dispatch(A, h, method, path):
    """Kembalikan True bila permintaan ditangani modul ini."""
    if not (path in ('/api/me', '/api/register', '/api/user/login', '/api/user/logout', '/api/admin/import') or path.startswith(('/api/my/', '/api/admin/applications', '/api/admin/documents/', '/api/admin/tenants'))):
        return False
    try:
        route(A, h, method, path)
    except Denied as error:
        h.send(error.status, {'error': str(error)})
    except (ValueError, TypeError, KeyError) as error:
        h.send(400, {'error': str(error) if isinstance(error, ValueError) else 'Permintaan tidak valid.'})
    except A.database.INTEGRITY_ERRORS:
        h.send(400, {'error': 'Data bertabrakan dengan data yang sudah ada.'})
    except A.storage.StorageError as error:
        print('Storage:', error, flush=True)
        h.send(502, {'error': 'Penyimpanan berkas sedang bermasalah. Coba lagi.'})
    return True


def need_user(A, h, method):
    user = user_session(A, h)
    if not user:
        raise Denied(401, 'Silakan masuk atau daftar sebagai penyewa.')
    if method != 'GET' and not hmac.compare_digest(h.headers.get('X-CSRF-Token', ''), user['csrf']):
        raise Denied(403, 'Sesi tidak valid. Muat ulang halaman.')
    return user


def need_admin(A, h, method):
    session = h.session()
    if not session:
        raise Denied(401, 'Silakan login sebagai admin.')
    if method != 'GET' and not hmac.compare_digest(h.headers.get('X-CSRF-Token', ''), session['csrf']):
        raise Denied(403, 'Sesi tidak valid. Muat ulang halaman.')


def route(A, h, method, path):
    if path == '/api/me' and method == 'GET':
        user = user_session(A, h)
        return h.send(200, {'authenticated': bool(user), 'csrf': user['csrf'] if user else None, 'user': user_json(user) if user else None})
    if path == '/api/register' and method == 'POST':
        return register(A, h, h.json_body(20000))
    if path == '/api/user/login' and method == 'POST':
        return user_login(A, h, h.json_body(20000))
    if path == '/api/user/logout' and method == 'POST':
        user = need_user(A, h, method)
        with A.connect() as db:
            db.execute('DELETE FROM user_sessions WHERE token_hash=?', (user['token_hash'],))
        return h.send(200, {'ok': True}, extra=cookie(A, '', 0))
    if path.startswith('/api/my/'):
        return route_tenant(A, h, method, path, need_user(A, h, method))
    need_admin(A, h, method)
    return route_admin(A, h, method, path)


def route_tenant(A, h, method, path, user):
    uid = user['uid']
    if path == '/api/my/profile' and method == 'PUT':
        body = h.json_body(20000)
        name = body.get('name')
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 100:
            raise ValueError('Nama wajib diisi (2-100 karakter).')
        wa = clean_whatsapp(body.get('whatsapp', ''))
        with A.WRITE_LOCK, A.connect() as db:
            db.execute('UPDATE users SET name=?,whatsapp=? WHERE id=?', (name.strip(), wa, uid))
        return h.send(200, {'authenticated': True, 'csrf': user['csrf'], 'user': {'id': uid, 'name': name.strip(), 'email': user['email'], 'whatsapp': wa}})
    if path == '/api/my/ktp':
        if method == 'GET':
            with A.connect() as db:
                versions = [doc_json(d, False) for d in db.execute("SELECT * FROM documents WHERE user_id=? AND kind='ktp' ORDER BY version DESC", (uid,))]
            return h.send(200, {'latest': versions[0] if versions else None, 'versions': versions})
        if method == 'POST':
            upload = read_upload(h.json_body())
            with A.WRITE_LOCK, A.connect() as db:
                doc_id = add_document(A, db, uid, None, 'ktp', upload)
                db.execute("UPDATE applications SET ktp_doc_id=?,updated=? WHERE user_id=? AND kind!='survei' AND closed=0 AND applied=0 AND status IN ('diproses','perlu_perbaikan')", (doc_id, now(), uid))
            return h.send(201, {'ok': True, 'id': doc_id})
    if path == '/api/my/applications':
        if method == 'GET':
            with A.connect() as db:
                rows = db.execute('SELECT * FROM applications WHERE user_id=? ORDER BY created DESC', (uid,)).fetchall()
                return h.send(200, [app_json(db, r) for r in rows])
        if method == 'POST':
            body = h.json_body(20000)
            with A.WRITE_LOCK, A.connect() as db:
                row, created = create_application(A, db, user, body)
                payload = dict(app_json(db, row), existing=not created)
            return h.send(201 if created else 200, payload)
    if path == '/api/my/leases' and method == 'GET':
        with A.connect() as db:
            return h.send(200, [lease_json(db, l) for l in db.execute('SELECT * FROM leases WHERE user_id=? ORDER BY created DESC', (uid,))])
    match = re.fullmatch(r'/api/my/documents/([a-f0-9]+)/file', path)
    if match and method == 'GET':
        with A.connect() as db:
            doc = db.execute('SELECT * FROM documents WHERE id=? AND user_id=?', (match[1], uid)).fetchone()
        if not doc:
            raise Denied(404, 'Berkas tidak tersedia.')
        return serve_file(A, h, doc)
    match = re.fullmatch(r'/api/my/applications/([a-f0-9]+)(/documents|/cancel)?', path)
    if match:
        with A.connect() as db:
            row = db.execute('SELECT * FROM applications WHERE id=? AND user_id=?', (match[1], uid)).fetchone()
            if not row:
                raise Denied(404, 'Pengajuan tidak ditemukan.')
            if not match[2] and method == 'GET':
                return h.send(200, app_detail(A, db, row, False))
        if match[2] == '/cancel' and method == 'POST':
            h.json_body(20000)
            if row['applied'] or row['closed'] or row['payment'] != 'belum':
                raise ValueError('Pengajuan ini tidak dapat dibatalkan dari akun Anda. Hubungi pengelola.')
            with A.WRITE_LOCK, A.connect() as db:
                db.execute("UPDATE applications SET status='dibatalkan',closed=1,updated=? WHERE id=?", (now(), row['id']))
            return h.send(200, {'ok': True})
        if match[2] == '/documents' and method == 'POST':
            if row['kind'] == 'survei' or row['closed']:
                raise ValueError('Pengajuan ini tidak menerima berkas.')
            upload = read_upload(h.json_body())
            with A.WRITE_LOCK, A.connect() as db:
                if not latest(db, uid, 'surat_siap_ttd', row['id']):
                    raise ValueError('Surat siap tanda tangan belum disediakan pengelola.')
                doc_id = add_document(A, db, uid, row['id'], 'surat_ttd', upload)
                if row['status'] == 'perlu_perbaikan':
                    db.execute("UPDATE applications SET status='diproses',updated=? WHERE id=?", (now(), row['id']))
            return h.send(201, {'ok': True, 'id': doc_id})
        if match[2] == '/documents':
            return h.send(405, {'error': 'Metode tidak diizinkan.'})
    match = re.fullmatch(r'/api/my/leases/([a-f0-9]+)/renew', path)
    if match and method == 'POST':
        h.json_body(20000)
        with A.WRITE_LOCK, A.connect() as db:
            row, created = create_application(A, db, user, {'kind': 'perpanjangan', 'lease_id': match[1]})
            payload = dict(app_json(db, row), existing=not created)
        return h.send(201 if created else 200, payload)
    raise Denied(404, 'Tidak ditemukan.')


def tenant_json(db, u):
    ktp = latest(db, u['id'], 'ktp')
    total, open_count = db.execute('SELECT COUNT(*), COALESCE(SUM(CASE WHEN closed=0 THEN 1 ELSE 0 END),0) FROM applications WHERE user_id=?', (u['id'],)).fetchone()
    return {'id': u['id'], 'name': u['name'], 'email': u['email'], 'whatsapp': u['whatsapp'], 'created': u['created'], 'ktp': doc_json(ktp, True) if ktp else None, 'applications': total, 'open': open_count}


def route_admin(A, h, method, path):
    if path == '/api/admin/tenants' and method == 'GET':
        text = parse_qs(urlparse(h.path).query).get('q', [''])[0].strip()
        sql, args = 'SELECT * FROM users WHERE 1=1', []
        if text:
            sql += ' AND (LOWER(name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) OR whatsapp LIKE ?)'
            args += [f'%{text}%'] * 3
        with A.connect() as db:
            rows = db.execute(sql + ' ORDER BY created DESC LIMIT 500', args).fetchall()
            return h.send(200, [tenant_json(db, u) for u in rows])
    match = re.fullmatch(r'/api/admin/tenants/([a-f0-9]+)', path)
    if match and method == 'GET':
        with A.connect() as db:
            u = db.execute('SELECT * FROM users WHERE id=?', (match[1],)).fetchone()
            if not u:
                raise Denied(404, 'Penyewa tidak ditemukan.')
            data = tenant_json(db, u)
            data['ktp_versions'] = [doc_json(d, True) for d in db.execute("SELECT * FROM documents WHERE user_id=? AND kind='ktp' ORDER BY version DESC", (u['id'],))]
            data['application_list'] = [app_json(db, a, True) for a in db.execute('SELECT * FROM applications WHERE user_id=? ORDER BY created DESC', (u['id'],))]
            data['leases'] = [lease_json(db, l) for l in db.execute('SELECT * FROM leases WHERE user_id=? ORDER BY created DESC', (u['id'],))]
            return h.send(200, data)
    if path == '/api/admin/import' and method == 'POST':
        return h.send(200, import_excel(A, h.json_body()))
    if path == '/api/admin/applications' and method == 'GET':
        query = parse_qs(urlparse(h.path).query)
        sql, args = 'SELECT a.* FROM applications a JOIN users u ON u.id=a.user_id WHERE 1=1', []
        for key, column in (('kind', 'a.kind'), ('status', 'a.status'), ('payment', 'a.payment')):
            if query.get(key, [''])[0]:
                sql += f' AND {column}=?'
                args.append(query[key][0])
        text = query.get('q', [''])[0].strip()
        if text:
            sql += ' AND (LOWER(a.ref) LIKE LOWER(?) OR LOWER(u.name) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?))'
            args += [f'%{text}%'] * 3
        with A.connect() as db:
            rows = db.execute(sql + ' ORDER BY a.created DESC LIMIT 500', args).fetchall()
            result = []
            for r in rows:
                item = app_json(db, r, True)
                ktp = latest(db, r['user_id'], 'ktp')
                ids = [ktp['id']] if ktp else []
                ids += [d['id'] for d in db.execute('SELECT id FROM documents WHERE application_id=?', (r['id'],))]
                item['pending_documents'] = sum(1 for i in ids if db.execute("SELECT 1 FROM documents WHERE id=? AND status='menunggu'", (i,)).fetchone())
                item['ktp_status'] = ktp['status'] if ktp else None
                result.append(item)
        return h.send(200, result)
    match = re.fullmatch(r'/api/admin/documents/([a-f0-9]+)(/file)?', path)
    if match:
        with A.connect() as db:
            doc = db.execute('SELECT * FROM documents WHERE id=?', (match[1],)).fetchone()
        if not doc:
            raise Denied(404, 'Berkas tidak ditemukan.')
        if match[2] and method == 'GET':
            return serve_file(A, h, doc)
        if not match[2] and method == 'PUT':
            body = h.json_body(20000)
            allowed = DOC_STATUS.get(doc['kind'])
            if not allowed or body.get('status') not in allowed:
                raise ValueError('Status berkas tidak valid.')
            reason = str(body.get('reason', '')).strip()[:1000]
            if body['status'] == 'perlu_perbaikan' and not reason:
                raise ValueError('Tuliskan alasan perbaikan.')
            with A.WRITE_LOCK, A.connect() as db:
                db.execute('UPDATE documents SET status=?,reason=? WHERE id=?', (body['status'], reason if body['status'] == 'perlu_perbaikan' else '', doc['id']))
            return h.send(200, {'ok': True})
        raise Denied(405, 'Metode tidak diizinkan.')
    match = re.fullmatch(r'/api/admin/applications/([a-f0-9]+)(/documents|/activate|/extend)?', path)
    if match:
        with A.connect() as db:
            row = db.execute('SELECT * FROM applications WHERE id=?', (match[1],)).fetchone()
            if not row:
                raise Denied(404, 'Pengajuan tidak ditemukan.')
            if not match[2] and method == 'GET':
                return h.send(200, app_detail(A, db, row, True))
        if not match[2] and method == 'PUT':
            with A.WRITE_LOCK, A.connect() as db:
                admin_update_application(A, db, db.execute('SELECT * FROM applications WHERE id=?', (row['id'],)).fetchone(), h.json_body(20000))
            return h.send(200, {'ok': True})
        if match[2] == '/documents' and method == 'POST':
            if row['kind'] == 'survei' or row['closed']:
                raise ValueError('Pengajuan ini tidak memerlukan surat.')
            upload = read_upload(h.json_body())
            with A.WRITE_LOCK, A.connect() as db:
                doc_id = add_document(A, db, row['user_id'], row['id'], 'surat_siap_ttd', upload)
            return h.send(201, {'ok': True, 'id': doc_id})
        if match[2] in ('/activate', '/extend') and method == 'POST':
            body = h.json_body(20000)
            with A.WRITE_LOCK, A.connect() as db:
                fresh = db.execute('SELECT * FROM applications WHERE id=?', (row['id'],)).fetchone()
                if match[2] == '/activate':
                    result = {'ok': True, 'lease_id': activate(A, db, fresh, body)}
                else:
                    extend(A, db, fresh, body)
                    result = {'ok': True}
            return h.send(200, result)
    raise Denied(404, 'Tidak ditemukan.')
