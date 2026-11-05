"""Penyimpanan berkas: folder lokal (default) atau Supabase Storage.

Mode Supabase aktif bila SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY diisi.
Bucket bersifat privat; seluruh akses berkas tetap lewat backend yang memeriksa hak akses.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BUCKETS = {'uploads': 'asset-photos', 'private': 'tenant-docs'}


class StorageError(Exception):
    pass


def remote():
    return bool(os.environ.get('SUPABASE_URL', '').strip() and os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip())


def backend_name():
    return 'Supabase Storage' if remote() else 'folder lokal'


def _request(method, path, body=None, content_type=None, extra=None):
    base = os.environ['SUPABASE_URL'].strip().rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY'].strip()
    headers = {'Authorization': 'Bearer ' + key, 'apikey': key, **(extra or {})}
    if content_type:
        headers['Content-Type'] = content_type
    request = urllib.request.Request(base + '/storage/v1' + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise StorageError(f'Supabase Storage tidak dapat dihubungi: {error}') from None


def _object(kind, name):
    return f'/object/{BUCKETS[kind]}/{urllib.parse.quote(name)}'


def _local(data_dir, kind, name):
    root = (Path(data_dir) / kind).resolve()
    path = (root / name).resolve()
    if not path.is_relative_to(root):
        raise StorageError('Nama berkas tidak valid.')
    return path


def ensure():
    """Buat bucket privat bila belum ada (aman dipanggil berulang)."""
    if not remote():
        return
    for bucket in BUCKETS.values():
        status, body = _request('POST', '/bucket', json.dumps({'id': bucket, 'name': bucket, 'public': False}).encode(), 'application/json')
        if status not in (200, 201) and b'already exists' not in body.lower() and status != 409:
            raise StorageError(f'Gagal menyiapkan bucket {bucket} ({status}): {body[:200].decode(errors="replace")}')


def put(data_dir, kind, name, raw, content_type='application/octet-stream'):
    if not remote():
        path = _local(data_dir, kind, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return
    status, body = _request('POST', _object(kind, name), raw, content_type, {'x-upsert': 'true'})
    if status not in (200, 201):
        raise StorageError(f'Unggah ke Supabase Storage gagal ({status}): {body[:200].decode(errors="replace")}')


def get(data_dir, kind, name):
    if not remote():
        path = _local(data_dir, kind, name)
        if not path.is_file():
            raise FileNotFoundError(name)
        return path.read_bytes()
    status, body = _request('GET', _object(kind, name))
    if status in (400, 404):
        raise FileNotFoundError(name)
    if status != 200:
        raise StorageError(f'Unduh dari Supabase Storage gagal ({status}).')
    return body


def delete(data_dir, kind, name):
    if not remote():
        _local(data_dir, kind, name).unlink(missing_ok=True)
        return
    status, body = _request('DELETE', _object(kind, name))
    if status not in (200, 204, 400, 404):
        raise StorageError(f'Hapus di Supabase Storage gagal ({status}).')
