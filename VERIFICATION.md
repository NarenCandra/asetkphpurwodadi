# Hasil verifikasi lokal

Tanggal: 30 Oktober 2026. Data pengujian admin menggunakan database sementara terpisah; tidak membuat akun default pada database aplikasi.

## Pemeriksaan kode dan backend

- `python scripts/check.py`: lulus pemeriksaan sintaks Python/JavaScript, JSON, dan whitespace. Aplikasi tidak memerlukan bundling.
- `python -m unittest discover -s tests -v`: 7 pengujian lulus, mencakup batas penanda bulanan 7/8 hari dan tahunan 30/31 hari, lewat tanggal akhir, otorisasi, CSRF, sesi/logout, validasi, konflik edit, foto, pembatalan dan siklus status.

## Browser Chromium melalui Playwright

| Pemeriksaan | Hasil |
| --- | --- |
| Landing → Jelajahi Rumah → katalog → detail | Lulus |
| Bulanan mengecualikan rumah khusus tahunan | Lulus |
| Filter kawasan dan hasil kosong; hapus filter | Lulus |
| Slider/sort nonaktif tanpa periode | Lulus |
| Ganti periode mereset batas dan urutan | Lulus |
| Drag kedua titik slider memperbarui hasil | Lulus |
| Keyboard Home/End tidak membuat titik saling melewati | Lulus |
| Login mengarah Beranda Admin | Lulus |
| Ringkasan Tersewa membuka daftar terfilter | Lulus |
| Tambah Draft, edit spesifikasi/harga, unggah foto | Lulus |
| Konfirmasi publikasi Tersedia | Lulus |
| Dipesan tetap publik; survei nonaktif | Lulus |
| Tersewa hilang dari katalog dan tautan langsung | Lulus |
| Penanda dan Kelola Masa Sewa dari beranda | Lulus |
| Logout kembali ke login | Lulus |
| Overflow horizontal katalog pada 360/390/768/1440 px | Tidak ada |
| Overflow detail dan formulir admin pada 390 px | Tidak ada |

Screenshot lokal ada di `test-results/landing-desktop.png`, `catalog-mobile.png`, `catalog-slider-mobile.png`, dan `admin-mobile.png` (diabaikan Git). Tampilan desktop dan katalog mobile telah diperiksa secara visual.

Nomor WhatsApp asli belum tersedia: keadaan tombol nonaktif telah diverifikasi. Belum menguji percakapan atau pengiriman pesan WhatsApp nyata. Identitas/konten rumah masih demo. Pemeriksaan ini tidak menyatakan kesiapan production atau menggantikan audit keamanan deployment.

## Penyempurnaan visual dengan frontend-design

Tema hijau pinus dan putih kabut diterapkan pada hero, navigasi, kartu rumah, filter, detail, kontak, login, dan panel admin. Ikon lokasi/kamar membantu pemindaian informasi. Tipografi menggunakan font sistem, tanpa permintaan font ke layanan eksternal; heading memakai Bahnschrift/Avenir Next dengan fallback Segoe UI.

- Pemeriksaan sintaks Python/JavaScript, JSON, dan whitespace: lulus.
- Beranda, katalog, detail, kontak, dan login diuji pada lebar 320, 360, 390, 768, 1024, 1440 px: tidak meluap horizontal.
- Beranda admin, daftar rumah, dan editor setelah login diuji pada lebar 320, 390, 768, 1440 px: tidak meluap horizontal.
- Login menuju Beranda Admin, menu ponsel, slider nonaktif sebelum periode, batas slider dengan keyboard, dan reset saat periode berubah: lulus.
- Tidak ditemukan exception JavaScript selama pemeriksaan tersebut.
- Preview: `test-results/redesign-desktop.png`, `redesign-mobile.png`, `redesign-catalog-mobile.png`, `redesign-admin-desktop.png`, dan `redesign-editor-mobile.png`.

Perubahan ini hanya menyempurnakan presentasi; aturan data/status dan autentikasi tetap menggunakan implementasi yang telah diuji sebelumnya.

### Revisi visual Sewaruma

Hero kini menggunakan foto lebar dengan lapisan kontras untuk teks, tombol hijau muda, kartu properti tanpa bingkai luar, serta footer hijau gelap. Preview terbaru: `test-results/sewaruma-photo-desktop.png` dan `test-results/sewaruma-photo-mobile.png`. Beranda diperiksa pada 320/390/768/1024/1440 px; katalog dan detail pada 320/390/768/1440 px, tanpa luapan horizontal. Navigasi dari Jelajahi Rumah ke katalog dan detail, filter bulanan, reset filter, serta batas dua titik slider melalui keyboard lulus. Judul halaman telah diverifikasi menggunakan nama Sewaruma.

### Tata letak khusus mobile

`public/assets/mobile.css` mengatur komposisi khusus hingga 720 px: judul pada panel terang, foto terpisah, tombol utama selebar panel, kartu dengan foto landscape, header sticky, filter dengan area sentuh lebih besar, spesifikasi dua kolom dan formulir admin satu kolom. Keterangan hero tetap berada di bawah foto. Desktop tetap memakai foto dengan overlay.

Halaman publik, login, beranda admin, daftar admin, dan editor diperiksa pada 320/360/390/430 px tanpa luapan horizontal. Filter bulanan, batas slider, menu ponsel dan navigasi kontak lulus. Formulir editor telah diverifikasi menjadi satu kolom. Preview: `test-results/mobile-improved-home.png` dan `test-results/mobile-improved-catalog.png`.

### Penyelarasan menyeluruh dengan PRD dan frontend-design

Versi mobile kembali mengikuti hero foto dengan overlay seperti desktop sesuai permintaan berikutnya. Keterangan foto tetap di luar hero. Panduan visual aktif dicatat di `DESIGN.md`.

- `npm.cmd run build`, `npm.cmd run lint`, dan 7 pengujian backend: lulus.
- Landing, katalog, detail, kontak, beranda admin, daftar rumah admin dan editor pada 320/390/768/1440 px: tidak meluap horizontal.
- Rentang slider terpilih terlihat; filter bulanan memperbarui hasil; ganti tahunan mereset batas; slider dan sort nonaktif tanpa periode: lulus.
- Galeri dapat dioperasikan dengan ArrowLeft/ArrowRight dan ditutup dengan Escape.
- Login menuju beranda, ringkasan Tersewa membuka daftar terfilter, simpan editor: lulus dengan database uji terpisah.
- Daftar admin mobile kini menyusun tabel tanpa scroll horizontal. Panel harga dan editor desktop memperhitungkan navbar sticky.
- Preview terkini: `test-results/prd-catalog-desktop.png`, `prd-admin-desktop.png`, `prd-admin-mobile.png`.

Tidak ada filter kamar tidur atau section publik baru yang ditambahkan. Harga, status, data internal, dan otorisasi tetap mengikuti PRD.

### Konsep baru Teras Hijau

Desain aktif menggunakan `terrace.css`: hero split terang, foto dengan sudut melengkung, kartu inset putih dan footer sage. Sudah diperiksa secara visual pada desktop dan ponsel. Beranda, katalog, detail, kontak, dan login diuji pada 320/390/768/1024/1440 px tanpa luapan horizontal. Filter bulanan dan menu mobile berfungsi; tidak ada exception JavaScript selama pemeriksaan. Pemeriksaan sintaks lulus. Preview terbaru: `test-results/terrace-desktop.png` dan `test-results/terrace-mobile.png`.


## Desain PRD 0.3 ? 2 November 2026

- Salinan sumber DOCX: PRD_v0_3.md. Cakupan tetap bangunan/tanah dan beranda sebelumnya sesuai jawaban pengguna.
- Pemeriksaan sintaks seluruh JavaScript frontend dan skrip build, Python, JSON: lulus. 10 tes backend: lulus.
- Browser lokal: layar masuk, daftar, profil/dokumen, pengajuan, detail pengajuan, sewa, perpanjangan, dan admin pengajuan tanpa error JavaScript. Lebar 320/390/768/1440 px diperiksa; tidak ada overflow halaman.
- Build statis: tidak memanggil /api; detail aset mempertahankan next menuju masuk, lalu menuju pratinjau konfirmasi survei pada aset yang sama. Tombol penyimpanan nonaktif dan tidak menghasilkan referensi palsu. Tab jenis pengajuan berfungsi.
- KTP tidak diminta saat daftar; tidak ada file input aktif atau penyimpanan dokumen pada pratinjau. Status dokumen, pengajuan, dan pembayaran terpisah. Tidak ada template surat fiktif.
- Beranda tetap hero penuh tanpa footer; maksimum lima foto slideshow dipertahankan. Data bangunan dan tanah tidak diubah.
- Rewrite rute baru ditambahkan untuk Netlify dan Vercel; sintaks TOML/JSON lulus. Deployment eksternal belum dilakukan.

Batas verifikasi: backend akun penyewa, berkas privat, pengajuan nyata, serta perpanjangan belum diimplementasikan; pemeriksaan ini hanya menyatakan kesiapan desain antarmuka dan regresi backend lama.
