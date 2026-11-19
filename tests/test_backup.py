import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
import backup


def use_data(path):
    app.DATA = Path(path); app.DB = app.DATA / 'catalog.sqlite3'; app.init_db()


class BackupRestoreTest(unittest.TestCase):
    def setUp(self):
        self.original = app.DATA, app.DB
        self.src, self.dst, self.out = (tempfile.TemporaryDirectory() for _ in range(3))
        use_data(self.src.name)
        with app.connect() as db:
            db.execute("INSERT INTO admin VALUES(1,'adm','salt','hash')")
            db.execute("INSERT INTO users(id,email,name,whatsapp,salt,password_hash,created) VALUES('u1','a@b.id','Budi Ünïcode','0812','s','h','2026-11-01')")
            db.execute("INSERT INTO houses(id,code,body) VALUES('h1','PWD-1',?)", (json.dumps({'name': 'Rumah "Dinas" & Co'}),))
            db.execute("INSERT INTO photos(id,house_id,filename,position) VALUES('p1','h1','foto1.jpg',0)")
            db.execute("INSERT INTO applications(id,ref,kind,user_id,house_id,created,updated) VALUES('a1','PGJ-1','sewa_baru','u1','h1','2026-11-02','2026-11-02')")
            db.execute("INSERT INTO documents(id,user_id,application_id,kind,filename,original_name,version,status,created) VALUES('d1','u1','a1','ktp','ktp1.pdf','ktp.pdf',1,'menunggu','2026-11-02')")
            db.execute("INSERT INTO documents(id,user_id,application_id,kind,filename,original_name,version,status,created) VALUES('d2','u1','a1','surat_ttd','hilang.pdf','s.pdf',1,'menunggu','2026-11-02')")
            db.execute("INSERT INTO sessions VALUES('tokenrahasia','csrf',9999999999)")
        app.storage.put(app.DATA, 'uploads', 'foto1.jpg', b'\xff\xd8JPEGDATA')
        app.storage.put(app.DATA, 'private', 'ktp1.pdf', b'%PDF-1.4 ktp')

    def tearDown(self):
        app.DATA, app.DB = self.original
        for t in (self.src, self.dst, self.out): t.cleanup()

    def make(self, **kw):
        return backup.backup(app, str(Path(self.out.name) / 'cadangan'), log=lambda *_: None, **kw)

    def test_backup_lalu_pulihkan_ke_database_kosong(self):
        result = self.make()
        folder = result['folder']
        self.assertEqual((result['files'], result['missing']), (2, 1))          # satu berkas hilang dicatat, tidak membatalkan
        self.assertFalse((folder / 'database' / 'sessions.jsonl').exists())      # sesi login tidak ikut
        self.assertNotIn('tokenrahasia', ''.join(p.read_text(encoding='utf-8') for p in (folder / 'database').iterdir()))
        manifest = json.loads((folder / 'MANIFEST.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['missing'][0]['nama'], 'hilang.pdf')
        use_data(self.dst.name)                                                    # tujuan baru yang kosong
        done = backup.restore(app, folder, log=lambda *_: None)
        self.assertEqual(done['files'], 2)
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT name FROM users").fetchone()['name'], 'Budi Ünïcode')
            self.assertEqual(json.loads(db.execute("SELECT body FROM houses").fetchone()['body'])['name'], 'Rumah "Dinas" & Co')
            self.assertEqual(db.execute("SELECT COUNT(*) AS n FROM documents").fetchone()['n'], 2)
            self.assertEqual(db.execute("SELECT COUNT(*) AS n FROM sessions").fetchone()['n'], 0)
        self.assertEqual(app.storage.get(app.DATA, 'uploads', 'foto1.jpg'), b'\xff\xd8JPEGDATA')
        self.assertEqual(app.storage.get(app.DATA, 'private', 'ktp1.pdf'), b'%PDF-1.4 ktp')

    def test_pulihkan_dari_zip(self):
        result = self.make(make_zip=True)
        use_data(self.dst.name)
        self.assertEqual(backup.restore(app, result['zip'], log=lambda *_: None)['rows'], result['rows'])

    def test_menolak_tujuan_berisi_data(self):
        folder = self.make()['folder']
        with self.assertRaises(SystemExit) as ctx:
            backup.restore(app, folder, log=lambda *_: None)                       # sumber sendiri masih berisi data
        self.assertIn('sudah berisi', str(ctx.exception))

    def test_cadangan_rusak_dibatalkan_sebelum_menyentuh_tujuan(self):
        folder = self.make()['folder']
        (folder / 'files' / 'uploads' / 'foto1.jpg').write_bytes(b'dirusak')
        use_data(self.dst.name)
        with self.assertRaises(SystemExit) as ctx:
            backup.restore(app, folder, log=lambda *_: None)
        self.assertIn('tidak utuh', str(ctx.exception))
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) AS n FROM users").fetchone()['n'], 0)

    def test_folder_tujuan_harus_baru_dan_di_luar_data(self):
        folder = self.make()['folder']
        with self.assertRaises(SystemExit):
            backup.backup(app, str(folder), log=lambda *_: None)
        with self.assertRaises(SystemExit):
            backup.backup(app, str(Path(self.src.name) / 'dalam'), log=lambda *_: None)


if __name__ == '__main__':
    unittest.main()
