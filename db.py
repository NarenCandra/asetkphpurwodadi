"""Lapisan database: SQLite lokal (default) atau Postgres Supabase (DATABASE_URL).

Seluruh SQL aplikasi ditulis dengan placeholder `?` dan fungsi yang portabel.
Untuk Postgres, `?` diterjemahkan menjadi `%s` dan hasil dibungkus Row yang dapat
diakses lewat indeks maupun nama kolom, sama seperti sqlite3.Row.
"""
import os
import re
import sqlite3
import threading
import time

try:  # driver Postgres hanya dibutuhkan bila DATABASE_URL diisi
    import psycopg
    INTEGRITY_ERRORS = (sqlite3.IntegrityError, psycopg.errors.IntegrityError)
except ImportError:  # pragma: no cover - lingkungan lokal tanpa psycopg
    psycopg = None
    INTEGRITY_ERRORS = (sqlite3.IntegrityError,)


def using_postgres():
    return bool(os.environ.get('DATABASE_URL', '').strip())


def backend_name():
    return 'Postgres (Supabase)' if using_postgres() else 'SQLite lokal'


class Row:
    """Baris hasil query: row[0], row['kolom'], row.keys(), dict(row), unpacking."""
    __slots__ = ('_names', '_values')

    def __init__(self, names, values):
        self._names, self._values = names, tuple(values)

    def __getitem__(self, key):
        if isinstance(key, str):
            try:
                return self._values[self._names.index(key)]
            except ValueError:
                raise IndexError('No item with that key') from None
        return self._values[key]

    def keys(self):
        return list(self._names)

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def __repr__(self):
        return f'Row({dict(zip(self._names, self._values))})'


def translate(sql, params):
    """Ubah SQL gaya SQLite (`?`) ke gaya psycopg (`%s`)."""
    if not params:
        return sql
    return sql.replace('%', '%%').replace('?', '%s')


def pg_script(script):
    """Sesuaikan skema SQLite agar valid di Postgres."""
    script = re.sub(r'PRAGMA[^;]*;', '', script)
    return script.replace(' COLLATE NOCASE', '').replace('expires INTEGER', 'expires BIGINT')


class PgCursor:
    def __init__(self, cursor):
        self._cursor = cursor
        self._names = [column.name for column in cursor.description] if cursor.description else []

    def fetchone(self):
        row = self._cursor.fetchone()
        return None if row is None else Row(self._names, row)

    def fetchall(self):
        return [Row(self._names, row) for row in self._cursor.fetchall()]

    def __iter__(self):
        return iter(self.fetchall())


# Membuka koneksi baru ke Supabase butuh beberapa kali bolak-balik jaringan (TCP, TLS, login), ratusan milidetik
# per request. Koneksi yang sudah selesai dipakai disimpan sebentar dan dipakai ulang.
POOL_MAX, POOL_IDLE, POOL_PING_AFTER = 6, 240, 10
_pool, _pool_lock = [], threading.Lock()


def _discard(connection):
    try:
        connection.close()
    except Exception:  # pragma: no cover - koneksi sudah putus
        pass


def _take(dsn):
    while True:
        with _pool_lock:
            index = next((i for i in range(len(_pool) - 1, -1, -1) if _pool[i][0] == dsn), None)
            entry = _pool.pop(index) if index is not None else None
        if entry is None:
            return None
        _, connection, since = entry
        age = time.monotonic() - since
        if getattr(connection, 'closed', False) or getattr(connection, 'broken', False) or age > POOL_IDLE:
            _discard(connection)
            continue
        if age > POOL_PING_AFTER:  # koneksi lama diam: pastikan belum diputus server
            try:
                connection.cursor().execute('SELECT 1')
                connection.rollback()
            except Exception:
                _discard(connection)
                continue
        return connection


def _give(dsn, connection):
    with _pool_lock:
        if not getattr(connection, 'closed', False) and not getattr(connection, 'broken', False) and len(_pool) < POOL_MAX:
            _pool.append((dsn, connection, time.monotonic()))
            return
    _discard(connection)


class PgConnection:
    def __init__(self, dsn):
        if psycopg is None:
            raise RuntimeError('Paket psycopg belum terpasang. Jalankan: pip install "psycopg[binary]"')
        self._dsn = dsn
        # prepare_threshold=None agar kompatibel dengan pooler Supabase (mode transaksi)
        self._connection = _take(dsn) or psycopg.connect(dsn, prepare_threshold=None, connect_timeout=15)

    def execute(self, sql, params=()):
        cursor = self._connection.cursor()
        cursor.execute(translate(sql, params), tuple(params) if params else None)
        return PgCursor(cursor)

    def executescript(self, script):
        cursor = self._connection.cursor()
        cursor.execute(pg_script(script))
        return cursor

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        """Kembalikan koneksi ke kolam (perubahan yang belum di-commit dibatalkan)."""
        connection, self._connection = self._connection, None
        if connection is None:
            return
        try:
            connection.rollback()
        except Exception:
            _discard(connection)
            return
        _give(self._dsn, connection)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        try:
            if self._connection is not None:
                if exc_type is None:
                    self._connection.commit()
                else:
                    self._connection.rollback()
        finally:
            self.close()
        return False


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


def connect(sqlite_path):
    if using_postgres():
        return PgConnection(os.environ['DATABASE_URL'].strip())
    db = sqlite3.connect(sqlite_path, timeout=15, factory=ClosingConnection)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db
