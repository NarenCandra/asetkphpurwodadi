"""Cadangan dan pemulihan data: semua tabel database + semua berkas (foto, KTP, surat).

Bekerja untuk mode SQLite lokal maupun Supabase (Postgres + Storage).

1) Salinan penuh sekali jalan (`backup-data`): satu folder

    cadangan-YYYYMMDD-HHMMSS/
        MANIFEST.json        daftar tabel/berkas beserta checksum SHA-256
        CARA-PEMULIHAN.txt
        database/<tabel>.jsonl
        files/uploads/...    foto aset      (bucket asset-photos)
        files/private/...    KTP dan surat  (bucket tenant-docs)

2) Cadangan inkremental untuk dijadwalkan (`backup-auto`): hanya yang baru atau berubah yang disimpan.

    <store>/tables/<sha256>.jsonl.gz   isi tiap tabel, bernama sesuai hash isinya (tabel sama = satu salinan)
    <store>/files/<jenis>/<nama>       foto/dokumen; nama berkas unik dan tidak pernah berubah -> diunduh sekali
    <store>/files-index.json           ukuran + SHA-256 tiap berkas (agar tidak dihitung ulang)
    <store>/snapshots/<waktu>.json     satu titik pemulihan: tabel mana (hash) + berkas mana

Tabel sesi login tidak ikut dicadangkan (tidak berguna dan sensitif). Cadangan memuat hash kata sandi
akun admin dan penyewa: simpan di tempat privat.
"""
import datetime
import gzip
import hashlib
import json
import mimetypes
import os
import shutil
import tempfile
import time
import zipfile
from pathlib import Path

SKIP_TABLES = {'sessions', 'user_sessions'}
FILE_TABLES = {'photos': 'uploads', 'documents': 'private'}  # tabel -> jenis penyimpanan; kolom `filename`
ORDER = ['admin', 'users', 'houses', 'photos', 'leases', 'lease_periods', 'applications', 'documents']  # urutan kunci asing
FORMAT = 1        # folder cadangan penuh
STORE_FORMAT = 2  # penyimpanan inkremental
LOCK_STALE = 6 * 3600

HOW_TO = """CARA MEMULIHKAN
================
1. Siapkan tujuan yang KOSONG: proyek Supabase baru (atau folder data SQLite baru lewat DATA_DIR).
   Isi .env dengan DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY milik tujuan itu.
2. Dari folder proyek, jalankan:
       python app.py restore-data --input "<folder atau .zip cadangan ini>"
   Perintah memeriksa checksum semua berkas lebih dulu, menolak bila tujuan sudah berisi data,
   lalu memasukkan tabel dan mengunggah ulang semua foto/dokumen.
3. Bila hanya unggah berkas yang gagal di tengah jalan, ulangi dengan: --files-only
4. Semua penyewa dan admin perlu login ulang (sesi tidak dicadangkan).

Catatan: berkas .env (kunci rahasia) TIDAK ada di cadangan ini. Simpan terpisah dan aman.
"""


def _sha256_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def _sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def list_tables(db, postgres):
    if postgres:
        rows = db.execute("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'").fetchall()
    else:
        rows = db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").fetchall()
    names = [row['name'] for row in rows if row['name'] not in SKIP_TABLES]
    return sorted(names, key=lambda n: (ORDER.index(n) if n in ORDER else len(ORDER), n))


def _safe_name(name):
    return bool(name) and '/' not in name and '\\' not in name and name not in ('.', '..')


# ----------------------------------------------------------------------------------------------------
# Salinan penuh sekali jalan
# ----------------------------------------------------------------------------------------------------
def backup(A, output=None, make_zip=False, log=print):
    """A = modul app (menyediakan connect, database, storage, DATA)."""
    postgres = A.database.using_postgres()
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    destination = Path(output or Path('backups') / f'cadangan-{stamp}').resolve()
    if destination.exists():
        raise SystemExit('Folder tujuan sudah ada. Gunakan nama folder baru.')
    if destination == A.DATA or A.DATA in destination.parents:
        raise SystemExit('Simpan cadangan di luar direktori data.')
    (destination / 'database').mkdir(parents=True)
    manifest = {'format': FORMAT, 'dibuat': datetime.datetime.now().isoformat(timespec='seconds'),
                'mode': 'supabase' if postgres else 'sqlite', 'tables': {}, 'files': [], 'missing': []}
    wanted = {}  # (jenis, nama) -> None, urutan terjaga
    log(f'Mencadangkan database ({manifest["mode"]})...')
    with A.connect() as db:
        if postgres:  # satu potret yang konsisten untuk semua tabel
            db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        for table in list_tables(db, postgres):
            rows = [dict(row) for row in db.execute(f'SELECT * FROM "{table}"').fetchall()]
            path = destination / 'database' / f'{table}.jsonl'
            with open(path, 'w', encoding='utf-8', newline='\n') as handle:
                for row in rows:
                    handle.write(json.dumps(row, ensure_ascii=False, default=str) + '\n')
            manifest['tables'][table] = {'rows': len(rows), 'sha256': _sha256_file(path)}
            log(f'  {table}: {len(rows)} baris')
            if table in FILE_TABLES:
                for row in rows:
                    wanted[(FILE_TABLES[table], row.get('filename'))] = None
    log(f'Mengunduh {len(wanted)} berkas...')
    for index, (kind, name) in enumerate(wanted, 1):
        if not _safe_name(name):
            manifest['missing'].append({'jenis': kind, 'nama': str(name), 'alasan': 'nama berkas tidak valid'})
            continue
        try:
            raw = A.storage.get(A.DATA, kind, name)
        except Exception as error:  # berkas hilang di storage: catat, jangan batalkan seluruh cadangan
            manifest['missing'].append({'jenis': kind, 'nama': name, 'alasan': str(error)[:200]})
            log(f'  PERINGATAN: {kind}/{name} tidak dapat diambil ({str(error)[:80]})')
            continue
        target = destination / 'files' / kind / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        manifest['files'].append({'jenis': kind, 'nama': name, 'bytes': len(raw), 'sha256': _sha256_bytes(raw)})
        if index % 25 == 0 or index == len(wanted):
            log(f'  {index}/{len(wanted)}')
    (destination / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    (destination / 'CARA-PEMULIHAN.txt').write_text(HOW_TO, encoding='utf-8')
    result = {'folder': destination, 'tables': len(manifest['tables']), 'rows': sum(t['rows'] for t in manifest['tables'].values()),
              'files': len(manifest['files']), 'missing': len(manifest['missing'])}
    if make_zip:
        result['zip'] = Path(shutil.make_archive(str(destination), 'zip', destination))
    return result


def _open_source(source, snapshot=None):
    """Folder cadangan, berkas .zip, atau penyimpanan inkremental (diambil satu snapshot-nya)."""
    source = Path(source).resolve()
    temp = None
    if source.is_file() and source.suffix.lower() == '.zip':
        temp = tempfile.TemporaryDirectory()
        with zipfile.ZipFile(source) as archive:
            archive.extractall(temp.name)
        source = Path(temp.name)
    elif (source / 'snapshots').is_dir() and not (source / 'MANIFEST.json').is_file():
        temp = tempfile.TemporaryDirectory()
        materialize(source, snapshot, Path(temp.name))
        source = Path(temp.name)
    if not (source / 'MANIFEST.json').is_file():
        raise SystemExit('MANIFEST.json tidak ditemukan: bukan folder cadangan yang valid.')
    return source, temp


def verify(source, manifest):
    """Periksa checksum semua berkas cadangan. Mengembalikan daftar masalah (kosong = utuh)."""
    problems = []
    for table, info in manifest['tables'].items():
        path = source / 'database' / f'{table}.jsonl'
        if not path.is_file() or _sha256_file(path) != info['sha256']:
            problems.append(f'database/{table}.jsonl rusak atau hilang')
    for item in manifest['files']:
        path = source / 'files' / item['jenis'] / item['nama']
        if not _safe_name(item['nama']) or not path.is_file() or _sha256_file(path) != item['sha256']:
            problems.append(f'files/{item["jenis"]}/{item["nama"]} rusak atau hilang')
    return problems


def restore(A, source, files_only=False, log=print, snapshot=None):
    source, temp = _open_source(source, snapshot)
    try:
        manifest = json.loads((source / 'MANIFEST.json').read_text(encoding='utf-8'))
        if manifest.get('format') != FORMAT:
            raise SystemExit('Format cadangan tidak dikenali.')
        log('Memeriksa keutuhan cadangan...')
        problems = verify(source, manifest)
        if problems:
            raise SystemExit('Cadangan tidak utuh, pemulihan dibatalkan:\n  ' + '\n  '.join(problems[:10]))
        tables = sorted(manifest['tables'], key=lambda n: (ORDER.index(n) if n in ORDER else len(ORDER), n))
        if not files_only:
            with A.connect() as db:
                for table in tables:
                    try:
                        count = db.execute(f'SELECT COUNT(*) AS n FROM "{table}"').fetchone()['n']
                    except Exception:
                        raise SystemExit(f'Tabel {table} tidak ada di tujuan. Jalankan `python app.py init` dulu.') from None
                    if count:
                        raise SystemExit(f'Tabel {table} di tujuan sudah berisi {count} baris. Pemulihan hanya untuk database kosong (proyek/folder data baru).')
                for table in tables:
                    rows = [json.loads(line) for line in (source / 'database' / f'{table}.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
                    if rows:
                        columns = list(rows[0])
                        head = f'INSERT INTO "{table}" ({", ".join(chr(34) + c + chr(34) for c in columns)}) VALUES '
                        group = (", ".join("?" for _ in columns)).join("()")
                        size = max(1, 900 // len(columns))  # beberapa baris per perintah: jauh lebih cepat ke database jarak jauh
                        for start in range(0, len(rows), size):
                            chunk = rows[start:start + size]
                            db.execute(head + ", ".join([group] * len(chunk)), [row[c] for row in chunk for c in columns])
                    log(f'  {table}: {len(rows)} baris dipulihkan')
        A.storage.ensure()
        log(f'Mengunggah {len(manifest["files"])} berkas...')
        for index, item in enumerate(manifest['files'], 1):
            raw = (source / 'files' / item['jenis'] / item['nama']).read_bytes()
            A.storage.put(A.DATA, item['jenis'], item['nama'], raw, mimetypes.guess_type(item['nama'])[0] or 'application/octet-stream')
            if index % 25 == 0 or index == len(manifest['files']):
                log(f'  {index}/{len(manifest["files"])}')
        return {'tables': len(tables), 'rows': sum(manifest['tables'][t]['rows'] for t in tables), 'files': len(manifest['files']), 'missing': manifest['missing']}
    finally:
        if temp:
            temp.cleanup()


# ----------------------------------------------------------------------------------------------------
# Cadangan inkremental (untuk dijadwalkan)
# ----------------------------------------------------------------------------------------------------
def _atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_bytes(data)
    os.replace(temp, path)


def _read_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return default


class _Lock:
    """Cegah dua backup berjalan bersamaan (mis. jadwal bertabrakan dengan backup manual)."""

    def __init__(self, store):
        self.path = store / 'LOCK'

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists() and time.time() - self.path.stat().st_mtime > LOCK_STALE:
            self.path.unlink()  # sisa dari proses yang mati
        try:
            os.close(os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
        except FileExistsError:
            raise SystemExit('Backup lain sedang berjalan (berkas LOCK ada). Coba lagi nanti.') from None
        return self

    def __exit__(self, *exc):
        try:
            self.path.unlink()
        except OSError:
            pass
        return False


def _snapshot_ids(store):
    return sorted(p.stem for p in (store / 'snapshots').glob('*.json')) if (store / 'snapshots').is_dir() else []


def _load_snapshot(store, snapshot):
    ids = _snapshot_ids(store)
    if not ids:
        raise SystemExit('Belum ada snapshot di penyimpanan ini.')
    chosen = ids[-1] if snapshot in (None, '', 'latest') else snapshot
    if chosen not in ids:
        raise SystemExit(f'Snapshot {chosen} tidak ada. Lihat daftar dengan: python app.py backup-list')
    return chosen, json.loads((store / 'snapshots' / f'{chosen}.json').read_text(encoding='utf-8'))


def _file_key(item):
    return (item['jenis'], item['nama'], item['sha256'])


def auto_backup(A, store=None, keep=30, log=print):
    store = Path(store or Path('backups') / 'auto').resolve()
    if store == A.DATA or A.DATA in store.parents:
        raise SystemExit('Simpan cadangan di luar direktori data.')
    postgres = A.database.using_postgres()
    with _Lock(store):
        index = _read_json(store / 'files-index.json', {})
        tables, wanted, new_tables = {}, {}, 0
        log(f'Membaca database ({"supabase" if postgres else "sqlite"})...')
        with A.connect() as db:
            if postgres:
                db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
            for table in list_tables(db, postgres):
                rows = [dict(row) for row in db.execute(f'SELECT * FROM "{table}" ORDER BY 1').fetchall()]
                data = ''.join(json.dumps(row, ensure_ascii=False, default=str) + '\n' for row in rows).encode('utf-8')
                digest = _sha256_bytes(data)
                blob = store / 'tables' / f'{digest}.jsonl.gz'
                if not blob.exists():
                    _atomic_write(blob, gzip.compress(data, mtime=0))
                    new_tables += 1
                tables[table] = {'rows': len(rows), 'sha256': digest}
                if table in FILE_TABLES:
                    for row in rows:
                        wanted[(FILE_TABLES[table], row.get('filename'))] = None
        files, missing, downloaded = [], [], 0
        for kind, name in wanted:
            key = f'{kind}/{name}'
            if not _safe_name(name):
                missing.append({'jenis': kind, 'nama': str(name), 'alasan': 'nama berkas tidak valid'})
                continue
            path = store / 'files' / kind / name
            entry = index.get(key)
            if entry and path.is_file() and path.stat().st_size == entry['bytes']:
                files.append({'jenis': kind, 'nama': name, **entry})  # sudah tersimpan: tidak diunduh lagi
                continue
            try:
                raw = A.storage.get(A.DATA, kind, name)
            except Exception as error:
                missing.append({'jenis': kind, 'nama': name, 'alasan': str(error)[:200]})
                log(f'  PERINGATAN: {key} tidak dapat diambil ({str(error)[:80]})')
                continue
            entry = {'bytes': len(raw), 'sha256': _sha256_bytes(raw)}
            _atomic_write(path, raw)
            index[key] = entry
            files.append({'jenis': kind, 'nama': name, **entry})
            downloaded += 1
        _atomic_write(store / 'files-index.json', json.dumps(index, indent=1).encode('utf-8'))
        ids = _snapshot_ids(store)
        if ids:
            last = json.loads((store / 'snapshots' / f'{ids[-1]}.json').read_text(encoding='utf-8'))
            if last['tables'] == tables and sorted(map(_file_key, last['files'])) == sorted(map(_file_key, files)):
                log('Tidak ada perubahan sejak snapshot terakhir. Tidak ada yang disimpan.')
                return {'skipped': True, 'snapshot': ids[-1], 'downloaded': downloaded, 'new_tables': new_tables, 'missing': len(missing), 'removed': 0}
        stamp = base = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        counter = 1
        while (store / 'snapshots' / f'{stamp}.json').exists():  # id harus unik walau dua backup jatuh di detik yang sama
            counter += 1
            stamp = f'{base}-{counter:02d}'
        manifest = {'format': STORE_FORMAT, 'dibuat': datetime.datetime.now().isoformat(timespec='seconds'),
                    'mode': 'supabase' if postgres else 'sqlite', 'tables': tables, 'files': files, 'missing': missing}
        _atomic_write(store / 'snapshots' / f'{stamp}.json', json.dumps(manifest, indent=1, ensure_ascii=False).encode('utf-8'))  # ditulis terakhir
        removed = _prune(store, keep, log)
        log(f'Snapshot {stamp}: {len(tables)} tabel, {sum(t["rows"] for t in tables.values())} baris, {len(files)} berkas '
            f'({downloaded} berkas baru diunduh, {new_tables} tabel berubah).')
        return {'skipped': False, 'snapshot': stamp, 'downloaded': downloaded, 'new_tables': new_tables, 'missing': len(missing), 'removed': removed}


def _prune(store, keep, log=print):
    """Hapus snapshot lama (sisakan `keep` terbaru), lalu buang tabel/berkas yang tidak dipakai snapshot mana pun."""
    ids = _snapshot_ids(store)
    for old in (ids[:-keep] if keep and len(ids) > keep else []):
        (store / 'snapshots' / f'{old}.json').unlink()
    used_tables, used_files = set(), set()
    for sid in _snapshot_ids(store):
        manifest = json.loads((store / 'snapshots' / f'{sid}.json').read_text(encoding='utf-8'))
        used_tables |= {t['sha256'] for t in manifest['tables'].values()}
        used_files |= {f'{f["jenis"]}/{f["nama"]}' for f in manifest['files']}
    removed = 0
    for blob in (store / 'tables').glob('*.jsonl.gz') if (store / 'tables').is_dir() else []:
        if blob.name[:-len('.jsonl.gz')] not in used_tables:
            blob.unlink()
            removed += 1
    index = _read_json(store / 'files-index.json', {})
    for key in list(index):
        if key not in used_files:
            (store / 'files' / key).unlink(missing_ok=True)
            del index[key]
            removed += 1
    _atomic_write(store / 'files-index.json', json.dumps(index, indent=1).encode('utf-8'))
    if removed:
        log(f'Pembersihan: {removed} item lama yang tidak dipakai snapshot mana pun dihapus.')
    return removed


def list_snapshots(store=None):
    store = Path(store or Path('backups') / 'auto').resolve()
    out = []
    for sid in _snapshot_ids(store):
        manifest = json.loads((store / 'snapshots' / f'{sid}.json').read_text(encoding='utf-8'))
        out.append({'id': sid, 'dibuat': manifest['dibuat'], 'rows': sum(t['rows'] for t in manifest['tables'].values()),
                    'files': len(manifest['files']), 'missing': len(manifest['missing'])})
    return out


def verify_store(store=None):
    """Periksa semua snapshot: setiap tabel dan berkas harus ada dan cocok checksum-nya."""
    store = Path(store or Path('backups') / 'auto').resolve()
    problems, seen = [], set()
    for sid in _snapshot_ids(store):
        manifest = json.loads((store / 'snapshots' / f'{sid}.json').read_text(encoding='utf-8'))
        for table, info in manifest['tables'].items():
            blob = store / 'tables' / f'{info["sha256"]}.jsonl.gz'
            if info['sha256'] in seen:
                continue
            seen.add(info['sha256'])
            try:
                ok = _sha256_bytes(gzip.decompress(blob.read_bytes())) == info['sha256']
            except (OSError, EOFError, gzip.BadGzipFile):
                ok = False
            if not ok:
                problems.append(f'snapshot {sid}: tabel {table} rusak atau hilang')
        for item in manifest['files']:
            key = f'{item["jenis"]}/{item["nama"]}'
            if key in seen:
                continue
            seen.add(key)
            path = store / 'files' / item['jenis'] / item['nama']
            if not path.is_file() or _sha256_file(path) != item['sha256']:
                problems.append(f'snapshot {sid}: berkas {key} rusak atau hilang')
    return problems


def materialize(store, snapshot, dest):
    """Ubah satu snapshot menjadi folder cadangan biasa (format 1) agar bisa dipulihkan dengan restore()."""
    store, dest = Path(store).resolve(), Path(dest)
    sid, manifest = _load_snapshot(store, snapshot)
    (dest / 'database').mkdir(parents=True, exist_ok=True)
    tables = {}
    for table, info in manifest['tables'].items():
        blob = store / 'tables' / f'{info["sha256"]}.jsonl.gz'
        if not blob.is_file():
            raise SystemExit(f'Snapshot {sid} tidak utuh: tabel {table} hilang. Jalankan: python app.py backup-verify')
        (dest / 'database' / f'{table}.jsonl').write_bytes(gzip.decompress(blob.read_bytes()))
        tables[table] = {'rows': info['rows'], 'sha256': info['sha256']}
    for item in manifest['files']:
        source = store / 'files' / item['jenis'] / item['nama']
        if not source.is_file():
            raise SystemExit(f'Snapshot {sid} tidak utuh: berkas {item["jenis"]}/{item["nama"]} hilang. Jalankan: python app.py backup-verify')
        target = dest / 'files' / item['jenis'] / item['nama']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (dest / 'MANIFEST.json').write_text(json.dumps({'format': FORMAT, 'dibuat': manifest['dibuat'], 'mode': manifest['mode'], 'tables': tables,
                                                    'files': manifest['files'], 'missing': manifest['missing']}, ensure_ascii=False), encoding='utf-8')
    return sid
