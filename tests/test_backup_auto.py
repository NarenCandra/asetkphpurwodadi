import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
import backup

quiet = lambda *_: None


def use_data(path):
    app.DATA = Path(path); app.DB = app.DATA / 'catalog.sqlite3'; app.init_db()


def tree(store):
    """Isi penyimpanan (tanpa LOCK): nama -> ukuran. Dipakai untuk membuktikan tidak ada yang bertambah."""
    return {str(p.relative_to(store)): p.stat().st_size for p in store.rglob('*') if p.is_file() and p.name != 'LOCK' and 'snapshots' not in p.parts}


class IncrementalBackupTest(unittest.TestCase):
    def setUp(self):
        self.original = app.DATA, app.DB
        self.src, self.dst, self.store = (tempfile.TemporaryDirectory() for _ in range(3))
        use_data(self.src.name)
        self.store_path = Path(self.store.name) / 'auto'
        self.downloads = []
        real_get = app.storage.get
        self._real_get = real_get
        app.storage.get = lambda data, kind, name: (self.downloads.append(f'{kind}/{name}'), real_get(data, kind, name))[1]
        with app.connect() as db:
            db.execute("INSERT INTO users(id,email,name,whatsapp,salt,password_hash,created) VALUES('u1','a@b.id','Budi','0812','s','h','2026-11-01')")
            db.execute("INSERT INTO houses(id,code,body) VALUES('h1','PWD-1',?)", (json.dumps({'name': 'Rumah A'}),))
        self.add_photo('p1', 'foto1.jpg', b'\xff\xd8FOTO-SATU')

    def tearDown(self):
        app.storage.get = self._real_get
        app.DATA, app.DB = self.original
        for t in (self.src, self.dst, self.store): t.cleanup()

    def add_photo(self, pid, name, raw):
        app.storage.put(app.DATA, 'uploads', name, raw)
        with app.connect() as db:
            db.execute('INSERT INTO photos(id,house_id,filename,position) VALUES(?,?,?,0)', (pid, 'h1', name))

    def run_backup(self, keep=30):
        return backup.auto_backup(app, self.store_path, keep, log=quiet)

    def test_tanpa_perubahan_tidak_ada_yang_diunduh_atau_disimpan_lagi(self):
        first = self.run_backup()
        self.assertFalse(first['skipped']); self.assertEqual(first['downloaded'], 1)
        before, snaps = tree(self.store_path), backup._snapshot_ids(self.store_path)
        self.downloads.clear()
        second = self.run_backup()
        self.assertTrue(second['skipped'])
        self.assertEqual(self.downloads, [])                                   # foto lama TIDAK diunduh lagi
        self.assertEqual(tree(self.store_path), before)                        # tidak ada berkas bertambah
        self.assertEqual(backup._snapshot_ids(self.store_path), snaps)         # tidak ada snapshot baru

    def test_perubahan_hanya_menyimpan_yang_baru(self):
        self.run_backup()
        blobs_before = {p.name for p in (self.store_path / 'tables').iterdir()}
        self.downloads.clear()
        self.add_photo('p2', 'foto2.jpg', b'\xff\xd8FOTO-DUA')                # hanya tabel photos yang berubah + satu berkas baru
        result = self.run_backup()
        self.assertFalse(result['skipped'])
        self.assertEqual(self.downloads, ['uploads/foto2.jpg'])               # hanya foto baru yang diunduh
        self.assertEqual(result['new_tables'], 1)
        self.assertEqual(len({p.name for p in (self.store_path / 'tables').iterdir()} - blobs_before), 1)
        self.assertEqual(len(backup._snapshot_ids(self.store_path)), 2)

    def test_pulihkan_snapshot_terbaru_dan_lama(self):
        self.run_backup()
        first_id = backup._snapshot_ids(self.store_path)[-1]
        self.add_photo('p2', 'foto2.jpg', b'\xff\xd8FOTO-DUA')
        with app.connect() as db:
            db.execute("UPDATE houses SET body=? WHERE id='h1'", (json.dumps({'name': 'Rumah A (diubah)'}),))
        self.run_backup()
        use_data(self.dst.name)
        backup.restore(app, self.store_path, log=quiet)                      # terbaru
        with app.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) AS n FROM photos').fetchone()['n'], 2)
            self.assertIn('diubah', db.execute('SELECT body FROM houses').fetchone()['body'])
        self.assertEqual(app.storage.get(app.DATA, 'uploads', 'foto2.jpg'), b'\xff\xd8FOTO-DUA')
        use_data(self.dst.name + '/lama')                                      # snapshot pertama
        backup.restore(app, self.store_path, log=quiet, snapshot=first_id)
        with app.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) AS n FROM photos').fetchone()['n'], 1)
            self.assertNotIn('diubah', db.execute('SELECT body FROM houses').fetchone()['body'])

    def test_pembersihan_menjaga_jumlah_snapshot_dan_membuang_yang_tak_terpakai(self):
        for i in range(4):
            self.add_photo(f'q{i}', f'x{i}.jpg', b'\xff\xd8' + str(i).encode())
            self.run_backup(keep=2)
        self.assertEqual(len(backup._snapshot_ids(self.store_path)), 2)
        self.assertEqual(backup.verify_store(self.store_path), [])
        referenced = set()
        for sid in backup._snapshot_ids(self.store_path):
            referenced |= {t['sha256'] for t in json.loads((self.store_path / 'snapshots' / f'{sid}.json').read_text())['tables'].values()}
        self.assertEqual({p.name[:-9] for p in (self.store_path / 'tables').iterdir()}, referenced)  # tak ada tabel yatim
        use_data(self.dst.name)
        backup.restore(app, self.store_path, log=quiet)                      # snapshot yang tersisa tetap bisa dipulihkan

    def test_verifikasi_mendeteksi_berkas_rusak(self):
        self.run_backup()
        self.assertEqual(backup.verify_store(self.store_path), [])
        (self.store_path / 'files' / 'uploads' / 'foto1.jpg').write_bytes(b'dirusak!!!')
        self.assertTrue(backup.verify_store(self.store_path))
        use_data(self.dst.name)
        with self.assertRaises(SystemExit):
            backup.restore(app, self.store_path, log=quiet)                  # pemulihan menolak data rusak

    def test_berkas_hilang_di_storage_dicatat_tidak_menggagalkan_backup(self):
        with app.connect() as db:
            db.execute("INSERT INTO photos(id,house_id,filename,position) VALUES('pz','h1','hilang.jpg',1)")
        result = self.run_backup()
        self.assertEqual((result['missing'], result['downloaded']), (1, 1))
        self.assertEqual(backup.list_snapshots(self.store_path)[0]['missing'], 1)

    def test_dua_backup_bersamaan_ditolak_dan_lock_dilepas(self):
        with backup._Lock(self.store_path):
            with self.assertRaises(SystemExit) as ctx:
                self.run_backup()
            self.assertIn('sedang berjalan', str(ctx.exception))
        self.run_backup()                                                      # setelah lock dilepas, jalan normal


if __name__ == '__main__':
    unittest.main()
