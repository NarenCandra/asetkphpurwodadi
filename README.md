# Website penyewaan rumah

Implementasi lokal PRD versi 0.2. `PRD.md` merupakan salinan teks dokumen `PRD_Web_Penyewaan_Rumah_v0_2.docx`, yang tetap menjadi sumber utama. Belum dilakukan deployment.

## Menjalankan di Windows

Prasyarat: Python 3.12 atau lebih baru. Node.js 18+ hanya dibutuhkan untuk pemeriksaan sintaks JavaScript. Tidak ada dependency runtime yang perlu diunduh.

```powershell
Copy-Item .env.example .env
python app.py init
python app.py seed-demo
python app.py create-admin
python app.py serve
```

Buka **http://127.0.0.1:8000**. Panel pengelola: **http://127.0.0.1:8000/admin**. `create-admin` meminta nama pengguna dan kata sandi minimal 12 karakter melalui terminal; kata sandi tidak tampil dan tidak disimpan di frontend. Tidak ada akun/kata sandi default. Satu akun admin saja dapat dibuat. Seed opsional; lewati untuk katalog kosong.

Untuk demo lokal, `LOCAL_ADMIN_DEMO=true` membuka panel admin tanpa formulir login melalui sesi server satu jam. Mode ini diaktifkan pada `.env` workspace atas permintaan pengguna; contoh konfigurasi tetap `false`. Hanya berlaku untuk alamat loopback dan Host localhost; akses data/tulis tetap memakai cookie sesi dan token CSRF. Ubah ke `false` lalu mulai ulang server untuk mengaktifkan login kembali; sesi demo lama langsung ditolak. Tombol Keluar tidak mengunci mode demo karena kunjungan berikutnya membuat sesi demo baru. Jangan aktifkan mode ini pada hosting publik.

Alternatif: `npm.cmd run dev` di PowerShell atau `npm run dev` pada shell yang mengizinkan skrip npm. `--port 8001` dapat digunakan jika port 8000 sudah dipakai. Tidak memerlukan `npm install`.

## Demo statis di Netlify

`netlify.toml` di root repository menjalankan `node scripts/build-demo.cjs` dan memublikasikan folder `dist`. Konfigurasi ini menggantikan pengaturan manual sebelumnya yang memakai `public`. Build hanya membaca konten contoh di `demo/` dan aset frontend; tidak membaca `.env`, database, foto unggahan admin, atau kredensial.

Demo menampilkan empat rumah publik contoh, filter, galeri, dan halaman kontak. URL langsung `/rumah/<id>`, `/tentang`, dan `/admin` diatur melalui rewrite. ID demo stabil antar-build. Panel admin menampilkan keterangan bahwa backend belum tersedia; perubahan data dan WhatsApp tidak diaktifkan pada demo. Website lokal yang dijalankan dengan `python app.py serve` tetap menggunakan API dan database asli.

Untuk memperbarui demo: push perubahan ke GitHub lalu tunggu deploy Netlify selesai. Log harus menampilkan `Static demo built: 4 public houses` dan publish directory `dist`. Jika Netlify masih memakai konfigurasi lama, pilih base repository root (`/`), build command `node scripts/build-demo.cjs`, dan publish directory `dist`.

Untuk mencoba hasil build lokal, jalankan `npm run build:demo`; folder `dist` adalah hasil build yang tidak perlu di-commit. Ini demo tampilan, bukan pengganti backend untuk pengelolaan properti nyata.

## Konfigurasi aplikasi lokal

Semua informasi pengelola di `.env`: `BUSINESS_NAME`, `BUSINESS_PROFILE`, `SERVICE_AREAS`, `SERVICE_HOURS`, `WHATSAPP_NUMBER`, `TIMEZONE`, `PORT`, `COOKIE_SECURE`. Mulai ulang server setelah perubahan.

- Nama usaha adalah Sewaruma. Profil, kawasan, dan jam layanan diisi data dummy berlabel contoh sesuai permintaan pengguna. Ganti dengan informasi asli sebelum peluncuran. `WHATSAPP_DISPLAY` hanya teks contoh; tautan chat tetap ditentukan oleh `WHATSAPP_NUMBER` yang harus menggunakan nomor asli.
- Nomor WhatsApp menggunakan format internasional digit saja, misalnya kode negara diikuti nomor sebenarnya, tanpa `+` atau spasi. Biarkan kosong sampai nomor milik pengelola tersedia. Tautan chat nonaktif jika kosong/tidak valid.
- `TIMEZONE=Asia/Jakarta` menjadi default. Asia/Bangkok, Asia/Makassar, Asia/Jayapura dan UTC juga berfungsi tanpa paket tambahan di Windows. Untuk zona IANA lain pada Windows, instal `tzdata` atau gunakan lingkungan yang menyediakan database zona waktu.
- `DATA_DIR` opsional mengubah direktori runtime (default `data/`). Jangan letakkan direktori ini di folder publik.
- `COOKIE_SECURE=false` khusus HTTP lokal. Hosting HTTPS nantinya memerlukan `true` dan konfigurasi reverse proxy yang benar.

## Data, foto, dan akun admin

SQLite berada di `data/catalog.sqlite3`; foto di `data/uploads/`. Semua persist setelah server dimulai ulang. Jangan menghapus folder ini pada penggunaan nyata. LocalStorage tidak digunakan sebagai database.

Data contoh terpisah di `demo/houses.json`; seed hanya berjalan pada database kosong dan tidak membuat akun admin. Ada 7 rumah contoh untuk seluruh status serta penanda masa sewa. Tanggal akhir contoh dibuat relatif terhadap tanggal kalender saat seed dijalankan.

Ilustrasi SVG lokal tersedia offline. Opsional, jalankan `python scripts/download_demo_photos.py` **sebelum seed** untuk menggunakan foto contoh. Sumber dicatat di `demo/ASSETS.md`. Foto contoh bukan foto rumah yang ditawarkan. Unggahan admin hanya menerima JPEG, PNG, WebP (maksimal 8 MB/foto, 20 foto/rumah).

Untuk mengganti demo dengan data nyata: gunakan `DATA_DIR` baru/kosong, jalankan `init` dan `create-admin`, lalu tambah rumah dari panel admin. Simpan sebagai Draft, unggah foto, lengkapi spesifikasi/harga, kemudian publikasikan. Jangan menggunakan rumah demo sebagai penawaran sebenarnya; label demo dipertahankan ketika diedit. Tidak perlu mengubah kode untuk menambah rumah atau mengelola foto.

Foto pertama menjadi foto utama. Tombol Kiri/Kanan mengurutkan; Jadikan utama memindahkan foto ke urutan pertama. Unggah, urutkan, dan hapus langsung tersimpan. Simpan Perubahan diperlukan untuk perubahan isian lainnya. Foto terakhir rumah publik tidak dapat dihapus sebelum ditarik ke Draft.

## Perilaku yang dipilih untuk usulan PRD

- Slider memakai batas semua rumah publik pada periode terpilih, tanpa dipersempit kawasan. Langkah Rp1; jika hanya satu harga, slider dikunci pada harga tersebut. Rentang inklusif, titik tidak dapat saling melewati. Slider dan urutan harga nonaktif sebelum periode dipilih; periode berubah mereset keduanya. Tersedia selalu mendahului Dipesan, lalu harga diurutkan dalam setiap kelompok.
- Tautan langsung rumah Draft/Tersewa menghasilkan API 404, halaman netral “Properti tidak tersedia”, dan akses foto ditolak bagi publik.
- Publikasi mensyaratkan nama/kode unik, deskripsi, kawasan, alamat, Google Maps HTTPS, luas dan jumlah kamar positif, foto, serta penawaran valid. Harga dan minimum sewa bilangan bulat positif. Tahun tidak dihitung dari bulan.
- Transisi status mengikuti PRD; tindakan tarik ke Draft tersedia. Perubahan status memerlukan dialog dan konfirmasi pada server. Dipesan memerlukan verifikasi DP manual; Tersewa memerlukan verifikasi pelunasan dan periode/tanggal aktif.
- Penanda menggunakan tanggal kalender operasional. Tidak ada penjadwalan, perubahan status, perpanjangan atau publikasi otomatis.
- WhatsApp hanya membuka percakapan, membawa nama/kode/tautan rumah, dan tidak mencatat transaksi atau survei terkonfirmasi.

## Pemeriksaan

```powershell
python scripts/check.py
python -m unittest discover -s tests -v
```

Alias: `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`. Aplikasi buildless: `build` memeriksa sintaks Python/JavaScript, JSON, dan whitespace; tidak menghasilkan bundle. Lint ini pemeriksaan ringan, bukan pemeriksaan tipe atau linter semantik penuh.

Pengujian backend menggunakan database/foto sementara, bukan data aplikasi. Meliputi sesi, CSRF, akses tanpa login, kebocoran properti/foto/tanggal internal, validasi, transisi status, tanggal sewa, penanda batas 7/30 hari, konflik edit, unggah/hapus/urut foto, dan logout.

## Cadangan dan pemulihan lokal

Hentikan server sebelum mencadangkan agar foto konsisten dengan database:

```powershell
python app.py backup --output backups/cadangan-pertama
```

Perintah menolak folder tujuan yang sudah ada dan folder dalam direktori data. Untuk memulihkan, hentikan server lalu salin `catalog.sqlite3` dan folder `uploads` dari cadangan ke **direktori runtime baru yang kosong**, atur `DATA_DIR` ke sana, dan jalankan server. Cadangan memuat hash kredensial dan sesi: simpan privat. Jika memulihkan di lingkungan berbeda, kosongkan tabel `sessions` melalui alat SQLite agar login lama tidak berlaku.

## Batasan sebelum produksi

Ini aplikasi lokal yang dapat dijalankan, bukan klaim siap produksi. Server HTTP bawaan Python ditujukan untuk penggunaan lokal. Peluncuran publik memerlukan server/reverse proxy production, HTTPS, pembatasan unggahan dan request di proxy, konfigurasi host, pemantauan, pencadangan terjadwal dan uji pemulihan, serta peninjauan keamanan. Pembatasan login saat ini di memori proses (10 percobaan/15 menit/IP), sesi bertahan 8 jam, kata sandi di-hash scrypt. Akses tulis membutuhkan sesi dan token CSRF; data internal dikeluarkan dari respons publik. Tidak ada reset kata sandi via email di versi awal.

Foto diperiksa melalui signature dan ukuran, tanpa re-encoding/optimisasi otomatis atau pemindaian file. Foto besar sebaiknya dioptimalkan sebelum unggah. Identitas usaha, nomor kontak, rumah/foto/alamat sebenarnya belum tersedia. Tidak ada pembayaran online maupun integrasi WhatsApp API.
