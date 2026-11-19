# Backup & Pemulihan Data

Panduan mencadangkan dan memulihkan data Sewa Aset: **semua tabel database** + **semua berkas** (foto aset, KTP, surat).
Berlaku untuk mode SQLite lokal maupun Supabase (Postgres + Storage).

## Ringkasan

| Kebutuhan | Perintah | Hasil |
| --- | --- | --- |
| Backup otomatis harian (disarankan) | `python app.py backup-auto` | Snapshot inkremental di `backups/auto` |
| Salinan penuh sekali jalan | `python app.py backup-data --zip` | Folder/zip `backups/cadangan-TANGGAL-JAM` |
| Lihat daftar snapshot | `python app.py backup-list` | Daftar titik pemulihan |
| Cek backup tidak rusak | `python app.py backup-verify` | Periksa checksum semua snapshot |
| Pulihkan data | `python app.py restore-data --input ...` | Data kembali ke tujuan yang kosong |

## Prasyarat

- Python terpasang dan perintah `python` bisa dijalankan.
- File `.env` terisi `DATABASE_URL`, `SUPABASE_URL`, dan `SUPABASE_SERVICE_ROLE_KEY` (untuk mode Supabase).
- Jalankan semua perintah dari **folder proyek**.

## 1. Backup otomatis harian (Windows)

Pasang jadwal **sekali saja**, dari folder proyek:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\pasang-jadwal-backup.ps1 -Jam 02:00
```

Setelah itu backup berjalan **tiap hari pukul 02:00** lewat Windows Task Scheduler (tugas bernama `BackupSewaAset`).

- Bila komputer mati pada jam itu, backup dijalankan begitu komputer menyala lagi.
- Jadwal ini milik komputer tempat kamu memasangnya, **bukan** milik server hosting. Komputer harus menyala dan terhubung internet agar bisa mengambil data dari Supabase.

Perintah berguna:

```powershell
Start-ScheduledTask -TaskName BackupSewaAset                       # uji sekarang
Get-Content backups\backup.log -Tail 20                            # lihat hasil
Unregister-ScheduledTask -TaskName BackupSewaAset -Confirm:$false  # hapus jadwal
```

Ubah jam: jalankan ulang perintah pasang dengan `-Jam` yang baru (jadwal lama ditimpa).

### Linux / macOS

Tambahkan ke `crontab -e`:

```
0 2 * * * cd /path/proyek && python3 app.py backup-auto >> backups/backup.log 2>&1
```

## 2. Lokasi penyimpanan

Bawaan: folder `backups/auto` di dalam proyek (sudah masuk `.gitignore`, jadi tidak ikut ter-commit).

```
backups/
├── backup.log                       log hasil tiap jalan
└── auto/
    ├── tables/<sha256>.jsonl.gz     isi tiap tabel (tabel yang sama = satu salinan)
    ├── files/uploads/...            foto aset
    ├── files/private/...            KTP dan surat
    ├── files-index.json             ukuran + checksum tiap berkas
    └── snapshots/<waktu>.json       satu titik pemulihan
```

### Simpan di luar komputer (sangat disarankan)

Backup di satu komputer ikut hilang bila komputer rusak atau hilang. Arahkan ke folder yang disinkronkan Google Drive / OneDrive.
Edit `scripts\backup-harian.bat`, ubah baris `python app.py backup-auto` menjadi:

```bat
python app.py backup-auto --store "D:\GoogleDrive\CadanganSewaAset" >> backups\backup.log 2>&1
```

Gunakan `--store` yang sama untuk `backup-list`, `backup-verify`, dan `restore-data --input`.

## 3. Cara kerja backup inkremental

- Foto/KTP/surat yang sudah tersimpan **tidak diunduh ulang** (nama berkas unik dan tidak pernah berubah).
- Tabel disimpan sekali per isi yang berbeda; tabel yang tidak berubah dipakai ulang snapshot berikutnya.
- Bila tidak ada perubahan sejak snapshot terakhir, **tidak ada snapshot baru** dibuat.
- Setiap snapshot adalah titik pemulihan penuh.
- Hanya **30 snapshot terbaru** disimpan (ubah dengan `--keep N`, `0` = simpan semua). Yang lebih lama dihapus beserta data yang tak dipakai lagi.
- Dua backup tidak bisa berjalan bersamaan (ada berkas `LOCK`). Bila muncul pesan "Backup lain sedang berjalan" padahal tidak ada, hapus `LOCK` di folder store, atau tunggu 6 jam (dianggap basi otomatis).
- Tabel sesi login **tidak ikut** dicadangkan.

## 4. Salinan penuh sekali jalan

Cocok sebelum migrasi besar atau sebelum deploy yang berisiko:

```powershell
python app.py backup-data --zip
```

Hasilnya `backups/cadangan-TANGGAL-JAM` (dan `.zip`) berisi `database/*.jsonl`, `files/`, `MANIFEST.json` (checksum SHA-256), dan `CARA-PEMULIHAN.txt`.

## 5. Memulihkan data

Pemulihan hanya untuk tujuan yang **kosong**: proyek Supabase baru, atau folder data SQLite baru (atur `DATA_DIR`). Perintah menolak bila tujuan sudah berisi data.

1. Siapkan tujuan kosong dan isi `.env` dengan kredensial tujuan itu.
2. Buat tabelnya: `python app.py init`
3. Pulihkan:

```powershell
# snapshot terbaru dari backup-auto
python app.py restore-data --input backups/auto

# snapshot tertentu (lihat ID dengan backup-list)
python app.py restore-data --input backups/auto --snapshot ID

# dari salinan penuh (folder atau .zip)
python app.py restore-data --input backups/cadangan-TANGGAL-JAM

# bila hanya unggah berkas yang gagal di tengah jalan
python app.py restore-data --input backups/auto --files-only
```

Checksum diperiksa dulu; bila ada yang rusak, pemulihan dibatalkan. Setelah pulih, semua admin dan penyewa perlu **login ulang**.

## 6. Checklist rutin

- [ ] Cek `backups\backup.log`: baris terakhir harus `kode keluar 0`.
- [ ] Jalankan `python app.py backup-verify` berkala (mis. seminggu sekali).
- [ ] Pastikan folder backup ikut tersinkron ke cloud / disk lain.
- [ ] **Uji pemulihan** ke proyek Supabase/folder data percobaan minimal sekali. Backup yang belum pernah diuji belum bisa dipercaya.
- [ ] Simpan salinan `.env` secara terpisah dan aman.

## Catatan keamanan

- Backup memuat **hash kata sandi** admin dan penyewa, serta **KTP**. Simpan di tempat privat; jangan dibagikan atau di-commit.
- `.env` (kunci rahasia) **tidak** ikut backup. Simpan terpisah.
- Lapisan tambahan: **Database > Backups** di dashboard Supabase (berkas Storage tidak ikut di sana).

## Pemecahan masalah

| Gejala | Penyebab / solusi |
| --- | --- |
| `Backup lain sedang berjalan` | Ada `LOCK` di folder store. Tunggu, atau hapus `LOCK` bila yakin tidak ada backup berjalan. |
| `Simpan cadangan di luar direktori data` | `--store` / `--output` tidak boleh di dalam `data/`. |
| `PERINGATAN: ... tidak dapat diambil` | Berkas ada di database tapi hilang di storage. Dicatat di `missing`, backup tetap lanjut. |
| `Tabel X di tujuan sudah berisi N baris` | Tujuan pemulihan tidak kosong. Gunakan proyek/folder data baru. |
| `Tabel X tidak ada di tujuan` | Jalankan `python app.py init` dulu. |
| Jadwal tidak jalan | Cek `Get-ScheduledTask -TaskName BackupSewaAset`, dan pastikan `python` ada di PATH untuk akun yang menjalankan tugas. |
