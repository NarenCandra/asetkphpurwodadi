"""Lapisan database: SQLite lokal (default) atau Postgres Supabase (DATABASE_URL).

Seluruh SQL aplikasi ditulis dengan placeholder `?` dan fungsi yang portabel.
Untuk Postgres, `?` diterjemahkan menjadi `%s` dan hasil dibungkus Row yang dapat
diakses lewat indeks maupun nama kolom, sama seperti sqlite3.Row.
"""
import os
import re
import sqlite3

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


class PgConnection:
    def __init__(self, dsn):
        if psycopg is None:
            raise RuntimeError('Paket psycopg belum terpasang. Jalankan: pip install "psycopg[binary]"')
        # prepare_threshold=None agar kompatibel dengan pooler Supabase (mode transaksi)
        self._connection = psycopg.connect(dsn, prepare_threshold=None, connect_timeout=15)

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
        self._connection.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        try:
            if exc_type is None:
                self._connection.commit()
            else:
                self._connection.rollback()
        finally:
            self._connection.close()
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
