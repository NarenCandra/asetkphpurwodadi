import sys, time, types, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import db


class FakeConn:
    def __init__(self):
        self.closed = False; self.log = []; self.fail_ping = False
    def cursor(self):
        conn = self
        class C:
            description = None
            def execute(self, sql, params=None):
                if conn.fail_ping and sql == 'SELECT 1': raise OSError('putus')
                conn.log.append(sql)
        return C()
    def commit(self): self.log.append('commit')
    def rollback(self): self.log.append('rollback')
    def close(self): self.closed = True


class PoolTest(unittest.TestCase):
    def setUp(self):
        self.made = []
        def connect(dsn, **kw):
            c = FakeConn(); self.made.append(c); return c
        self._old = db.psycopg
        db.psycopg = types.SimpleNamespace(connect=connect)
        db._pool.clear()

    def tearDown(self):
        db.psycopg = self._old; db._pool.clear()

    def test_koneksi_dipakai_ulang(self):
        for _ in range(5):
            with db.PgConnection('dsn://a'):
                pass
        self.assertEqual(len(self.made), 1)           # hanya satu koneksi nyata untuk 5 request
        self.assertFalse(self.made[0].closed)
        self.assertEqual(self.made[0].log.count('commit'), 5)

    def test_error_membatalkan_dan_tetap_bersih(self):
        with self.assertRaises(ValueError):
            with db.PgConnection('dsn://a'):
                raise ValueError('x')
        self.assertIn('rollback', self.made[0].log)
        with db.PgConnection('dsn://a'):
            pass
        self.assertEqual(len(self.made), 1)

    def test_koneksi_lama_yang_putus_diganti(self):
        with db.PgConnection('dsn://a'):
            pass
        db._pool[0] = (db._pool[0][0], db._pool[0][1], time.monotonic() - 60)  # sudah lama diam
        self.made[0].fail_ping = True
        with db.PgConnection('dsn://a'):
            pass
        self.assertEqual(len(self.made), 2)
        self.assertTrue(self.made[0].closed)

    def test_close_dua_kali_aman_dan_batas_kolam(self):
        c = db.PgConnection('dsn://a'); c.close(); c.close()
        self.assertEqual(len(db._pool), 1)
        held = [db.PgConnection('dsn://b%d' % i) for i in range(db.POOL_MAX + 3)]
        for h in held: h.close()
        self.assertLessEqual(len(db._pool), db.POOL_MAX)

    def test_dsn_berbeda_tidak_tercampur(self):
        with db.PgConnection('dsn://a'): pass
        with db.PgConnection('dsn://b'): pass
        self.assertEqual(len(self.made), 2)


if __name__ == '__main__':
    unittest.main()
