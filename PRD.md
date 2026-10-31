# Acuan produk

Disalin dari PRD_Web_Penyewaan_Rumah_v0_2.docx. Dokumen DOCX adalah sumber utama.

PRD Website Penyewaan Rumah

Versi 0.2 • 30 Oktober 2026 • Nama usaha belum ditentukan

Dokumen ini merangkum kebutuhan website katalog rumah sewa milik satu pengelola. Pengunjung mencari rumah, membaca informasi dan harga, lalu menghubungi satu nomor WhatsApp untuk survei wajib serta pembahasan transaksi. Admin memperbarui katalog dan status secara manual.

Versi 0.2 menjadi acuan rancangan awal dan memperbarui keputusan setelah peninjauan wireframe publik serta admin. Bagian yang masih berupa usulan penerapan ditandai secara eksplisit. Desain visual final, teknologi, biaya, dan jadwal pembangunan belum ditetapkan.

1 Tujuan dan pengguna

Memudahkan calon penyewa menemukan rumah utuh di beberapa kawasan sesuai anggaran dan periode sewa. Membantu pengelola menyampaikan informasi yang konsisten dan menjaga ketersediaan katalog tetap akurat.

Penyampaian bersifat universal untuk berbagai calon penyewa. Website tidak memiliki kategori hunian atau usaha dan tidak menyatakan bahwa setiap rumah dapat digunakan untuk semua jenis usaha. Kesesuaian kebutuhan dibahas melalui WhatsApp dan survei.

2 Cakupan versi awal

Termasuk

Di luar cakupan

Katalog dan detail rumah; filter; harga terbuka; alamat lengkap dan Google Maps.

Pembayaran online, checkout, dan konfirmasi pembayaran otomatis.

Pengajuan survei melalui WhatsApp; satu kontak untuk semua rumah.

Formulir survei, kalender pemesanan, dan jadwal otomatis.

Satu akun admin; pengelolaan foto, harga, periode, status, dan tanggal sewa.

Akun penyewa, banyak pemilik, banyak akun staf, dan portal penyewa.

Penanda akhir sewa di panel admin.

Notifikasi otomatis, ulasan, favorit, perbandingan khusus, serta pembukuan transaksi.



3 Ukuran keberhasilan

Versi awal berhasil jika pengunjung dapat menemukan rumah dan membuka chat yang sesuai, sementara admin dapat mengelola seluruh siklus status tanpa bantuan pembuat website. Target angka trafik, konversi, atau jumlah penyewaan belum ditetapkan; klik WhatsApp tidak dianggap sebagai transaksi berhasil.



4 Struktur halaman dan pengalaman

Halaman

Isi utama

Landing page publik

Pembuka dengan tombol Jelajahi Rumah, foto utama, pengenalan singkat, Rumah Tersedia, lalu footer. Katalog dibuka melalui tombol atau navigasi.

Daftar Rumah

Katalog; filter kawasan dan periode; slider rentang harga pada bagian tersendiri; pengurutan harga; status. Tanpa filter kamar tidur.

Detail Rumah

Galeri, spesifikasi, fasilitas, harga dan minimum sewa, alamat lengkap, Google Maps, ketentuan, dan tombol WhatsApp.

Tentang dan Kontak

Profil pengelola, wilayah layanan, nomor WhatsApp, dan jam layanan.

Login Admin

Akses satu akun pengelola; setelah login diarahkan ke Beranda Admin.

Beranda Admin

Ringkasan status, akses tambah dan kelola rumah, daftar masa sewa yang perlu perhatian, serta cuplikan daftar rumah.

Kelola Rumah

Daftar properti, tambah dan edit, pengelolaan foto, harga, penayangan, status, serta catatan tanggal sewa.



Arah visual

Arah visual tetap minimalis modern dengan warna netral dan aksen hijau; tampilan akhir disusun setelah wireframe. Judul beranda: “Temukan Rumah Sewa Sesuai Kebutuhan Anda”. Nama sementara: [Nama Usaha]. Ilustrasi dekoratif dan gaya editorial yang sempat ditampilkan tidak termasuk keputusan desain yang disetujui.

Alur pengunjung

Landing page publik → Jelajahi Rumah atau Lihat Semua → katalog → detail → chat WhatsApp → konfirmasi jadwal → survei wajib → kesepakatan harga dan ketentuan → DP → pelunasan. Kartu Rumah Tersedia pada landing page juga dapat langsung membuka detail.

Tombol dan isi WhatsApp

Tombol utama pada rumah Tersedia: “Jadwalkan Survei via WhatsApp”. Tidak ada pemilihan tanggal, jam, atau periode di formulir website. Periode pada katalog hanya berfungsi sebagai filter pencarian.

Contoh pesan: “Halo, saya tertarik dengan Rumah Melati (RM-001) yang saya lihat di [tautan detail]. Saya ingin menanyakan ketersediaan dan menjadwalkan survei.”

Membuka WhatsApp belum berarti jadwal disetujui, rumah dipesan, atau pembayaran diterima. Semua konfirmasi berlangsung melalui percakapan dengan pengelola.



5 Kebutuhan fitur publik

PUB 01 Katalog dan pencarian

Pengunjung dapat mencari rumah tanpa login. Kartu memuat foto utama, nama atau kode, kawasan, kamar tidur dan kamar mandi, harga berdasarkan periode, serta status. Rumah Tersedia ditampilkan sebelum Dipesan; Draft dan Tersewa tidak muncul di katalog. Jumlah kamar tetap merupakan informasi properti, tetapi tidak digunakan sebagai filter.

PUB 02 Filter dan pengurutan

Filter publik terdiri dari kawasan, periode bulanan atau tahunan, dan rentang harga. Rentang harga berada dalam bagian tersendiri dengan satu jalur slider dan dua titik yang dapat digeser: batas minimum di kiri dan maksimum di kanan. Nilai rupiah kedua batas terlihat dan daftar rumah diperbarui saat titik digeser. Harga memakai nilai yang dipublikasikan, bukan hasil negosiasi.

Periode harus dipilih sebelum slider dan pengurutan harga aktif. Label menegaskan harga per bulan atau per tahun; angka kedua periode tidak dicampur. Batas minimum tidak boleh melampaui maksimum. Tersedia tindakan hapus filter serta pesan jika hasil kosong. Saat periode berubah, rentang direset ke batas periode baru. Usulan penerapan: batas slider mengikuti harga terendah dan tertinggi dari katalog publik pada periode terpilih, tanpa dipersempit oleh filter kawasan.

PUB 03 Detail dan transparansi harga

Detail memuat galeri, deskripsi, luas tanah dan bangunan dalam m², kamar, fasilitas, alamat lengkap, tautan Google Maps, harga setiap periode yang tersedia, minimum sewa, serta ketentuan. Tampilkan “Harga dapat dinegosiasikan melalui WhatsApp”.

Harga bulanan dan tahunan diisi terpisah; sistem tidak menghitung tahunan sebagai harga bulanan dikali dua belas. Nominal DP, tenggat pelunasan, dan aturan pengembalian DP tidak ditentukan website. Ketiganya disepakati melalui WhatsApp sebelum pembayaran.

PUB 04 Kontak dan ketersediaan

Semua tombol pengajuan survei mengarah ke satu nomor WhatsApp pengelola. Pesan otomatis membawa identitas dan tautan rumah. Pada status Dipesan, label status tetap terlihat dan tombol survei dinonaktifkan. Kontak umum pengelola tetap dapat diakses dari halaman kontak.

PUB 05 Halaman yang tidak tersedia

Usulan penerapan: tautan langsung rumah Draft atau Tersewa tidak menampilkan detail publik dan memberikan pesan netral “Properti tidak tersedia” beserta tautan kembali ke katalog. Ini mencegah rumah tersewa tetap ditawarkan melalui tautan lama.



6 Kebutuhan admin dan data

ADM 01 Akses dan pengelolaan properti

Admin login dengan satu akun, menambah dan mengedit rumah, mengunggah serta mengurutkan foto, menentukan foto utama, mengatur harga dan periode, serta memperbarui status. Status Draft digunakan saat konten belum siap. Rumah Tersewa disimpan agar dapat ditayangkan kembali.

ADM 02 Data properti

Kelompok

Data

Identitas dan lokasi

Kode unik, nama rumah, deskripsi, kawasan, alamat lengkap, tautan Google Maps.

Spesifikasi

Luas tanah, luas bangunan, jumlah kamar tidur dan kamar mandi, daftar fasilitas.

Media

Foto utama dan galeri yang dapat diurutkan.

Penawaran

Pilihan bulanan, tahunan, atau keduanya; harga terpisah dan minimum sewa untuk tiap pilihan; ketentuan dan biaya tambahan jika ada.

Operasional internal

Status, periode sewa aktif, tanggal mulai, tanggal akhir sewa.



Usulan validasi: publikasi memerlukan identitas, kawasan, alamat, minimal satu foto, spesifikasi inti, serta minimal satu periode dengan harga positif dan minimum sewa bilangan bulat positif. Minimum bulanan dinyatakan dalam bulan; minimum tahunan dalam tahun. Nomor WhatsApp berlaku secara global.

ADM 03 Masa sewa dan penanda

Saat menandai Tersewa, admin mencatat periode sewa aktif, tanggal mulai, dan tanggal akhir. Periode aktif berbeda dari pilihan penawaran: rumah yang menawarkan kedua periode hanya memiliki satu periode aktif untuk penyewaan yang sedang berjalan.

Periode atau kondisi

Penanda admin

Bulanan dengan sisa 0 sampai 7 hari

Segera berakhir

Tahunan dengan sisa 0 sampai 30 hari

Segera berakhir

Tanggal akhir sudah lewat dan masih Tersewa

Perlu ditinjau

Di luar rentang tersebut

Tidak ada penanda khusus



Ambang 7 dan 30 hari telah disepakati. Usulan penerapan: gunakan selisih tanggal kalender pada zona waktu operasional pengelola. Perpanjangan memperbarui tanggal akhir; tidak ada perubahan status atau notifikasi otomatis.



Beranda admin dan revisi wireframe

ADM 04 Halaman awal setelah login

Setelah login berhasil, admin masuk ke Beranda Admin. Navigasi Beranda Admin dan Kelola Rumah tetap dapat dijangkau pada halaman daftar, formulir, dan pengelolaan status. Halaman awal admin berfungsi sebagai ringkasan operasional sebelum membuka daftar properti.

Ringkasan status rumah

Tampilkan jumlah rumah Tersedia, Dipesan, Tersewa, dan Draft berdasarkan data aktual. Memilih salah satu ringkasan membuka Kelola Rumah dengan filter status tersebut. Angka diperbarui setelah properti atau status berubah; tidak menampilkan pemasukan maupun statistik transaksi.

Akses tindakan dan perhatian

Sediakan Tambah Rumah dan Kelola Rumah. Daftar Perlu Perhatian memuat rumah dengan penanda Segera Berakhir atau Perlu Ditinjau, nama dan kode rumah, periode aktif, tanggal akhir, serta tombol Kelola Masa Sewa. Jika tidak ada, tampilkan keadaan kosong yang jelas. Cuplikan daftar rumah menyediakan Edit Rumah dan Lihat Semua.

Alur admin

Login → Beranda Admin → Tambah Rumah, Kelola Rumah, atau Kelola Masa Sewa. Admin memperbarui katalog dan tanggal sewa secara manual. Penanda tidak mengubah status dan tidak menayangkan kembali rumah secara otomatis.

Landing page publik yang disepakati

Urutan konten: navigasi → pembuka → pengenalan singkat → Rumah Tersedia → footer. Pembuka memuat judul, uraian singkat, foto, dan tombol Jelajahi Rumah. Bagian Rumah Tersedia memuat cuplikan properti serta akses Lihat Semua ke katalog. Pencarian dan filter berada pada katalog.

Bagian Cara Menyewa, FAQ, dan tombol tambahan di bawah Rumah Tersedia dihapus dari landing page. Baris promosi “Harga terbuka · Bisa nego · Survei sebelum sewa” juga dihapus. Ketentuan survei, DP, dan negosiasi tetap dijelaskan di detail rumah.

Catatan perubahan versi 0.2

Memisahkan slider harga dari filter lainnya; menghapus filter minimum kamar tidur; menetapkan landing page publik yang ringkas; menambahkan Beranda Admin sebelum Kelola Rumah. Tahap sekarang tetap wireframe. Permintaan landing page admin tidak mengubah desain landing page publik yang telah disepakati.



7 Aturan status dan transaksi

Status

Pemicu dan perilaku publik

Draft

Konten belum dipublikasikan; hanya admin dapat melihat.

Tersedia

Rumah siap ditawarkan; tampil dan pengajuan survei aktif.

Dipesan

Admin telah mengonfirmasi DP; rumah ditahan untuk pembayar DP, tampil dengan label dan survei nonaktif.

Tersewa

Admin mengonfirmasi pembayaran selesai; rumah disembunyikan dari publik, data tetap disimpan.



Transisi yang diizinkan

Draft → Tersedia setelah informasi siap. Tersedia → Dipesan setelah konfirmasi DP. Dipesan → Tersewa setelah pelunasan. Dipesan → Tersedia setelah pembatalan diselesaikan melalui WhatsApp. Tersewa → Tersedia setelah admin memastikan rumah siap dan memperbarui penawarannya.

Pengajuan dan pelaksanaan survei tidak mengubah status Tersedia. Setelah DP dikonfirmasi, rumah tidak dijanjikan kepada calon penyewa lain. Berakhirnya tenggat pelunasan atau masa sewa tidak mengubah status secara otomatis.

Kendali pengelola

Website tidak membaca percakapan, bukti transfer, atau saldo rekening. Pengelola bertanggung jawab memverifikasi DP dan pelunasan sebelum mengubah status. Nominal hasil negosiasi dan pencatatan transaksi tetap berada di luar sistem versi awal.

Usulan penerapan: sediakan tindakan sembunyikan ke Draft untuk menarik rumah dari penawaran tanpa menghapus datanya. Perubahan yang dapat membuka penawaran kembali perlu konfirmasi agar rumah tidak terpublikasi akibat salah klik.

8 Kebutuhan kualitas yang diusulkan

Responsif pada ponsel dan desktop. Navigasi, label status, filter, dan tombol dapat digunakan dengan keyboard; status dibedakan melalui teks selain warna. Foto dioptimalkan dan konten tidak meluap pada layar kecil.

Hanya admin terautentikasi yang dapat mengubah properti atau membaca tanggal sewa internal. Penyembunyian properti harus diterapkan pada pengambilan data publik, bukan sekadar tampilan. Data login disimpan melalui mekanisme autentikasi yang aman. Cadangan dan pemulihan data direncanakan sebelum peluncuran.



9 Kriteria penerimaan versi awal

ID

Skenario dan hasil yang diharapkan

AC 01

Rumah hanya bulanan tidak muncul pada hasil filter tahunan; rumah dengan kedua periode muncul pada keduanya.

AC 02

Slider minimum dan maksimum memakai harga sesuai periode; nilai rupiah tampil, hasil mengikuti rentang inklusif, dan perubahan periode mereset batas. Minimum sewa terlihat di detail.

AC 03

Klik survei pada rumah Tersedia membuka nomor WhatsApp yang sama dengan pesan berisi kode dan tautan rumah.

AC 04

Menjadwalkan atau melakukan survei tidak otomatis mengubah status rumah.

AC 05

Setelah admin menandai Dipesan, rumah tetap terlihat dengan label; tombol surveinya nonaktif.

AC 06

Setelah admin menandai Tersewa, rumah hilang dari katalog dan tetap dapat dikelola di admin.

AC 07

Pembatalan yang diselesaikan admin dapat mengembalikan rumah Dipesan menjadi Tersedia.

AC 08

Pada sisa 7 hari untuk bulanan dan 30 hari untuk tahunan, penanda muncul; pada 8 dan 31 hari belum muncul.

AC 09

Setelah tanggal akhir lewat, tampil Perlu ditinjau; rumah tetap Tersewa sampai admin mengubahnya.

AC 10

Admin dapat memperpanjang tanggal akhir dan menayangkan kembali rumah setelah siap; tanggal internal tidak tampil publik.

AC 11

Pengunjung tanpa login tidak dapat mengubah properti. Alur pencarian dan detail dapat digunakan di ponsel serta desktop.

AC 12

Landing page mengikuti urutan pembuka, pengenalan, Rumah Tersedia, footer. Tombol Jelajahi Rumah membuka katalog; Cara Menyewa, FAQ, dan baris promosi yang dihapus tidak tampil.

AC 13

Filter harga terpisah dari kawasan dan periode. Tidak ada filter kamar tidur; spesifikasi jumlah kamar tetap tampil pada kartu dan detail.

AC 14

Login mengarah ke Beranda Admin. Ringkasan status membuka daftar terfilter; tindakan tambah, edit, dan kelola masa sewa dapat dijalankan dari beranda.



10 Hal yang masih perlu ditinjau bersama

Nama usaha, logo, nomor WhatsApp, jam layanan, kawasan sebenarnya, dan data rumah belum diberikan. Data tersebut merupakan kebutuhan konten; tidak boleh diganti dengan informasi fiktif pada peluncuran.

Usulan penerapan yang masih perlu ditetapkan mencakup langkah kenaikan slider dan perilaku jika hanya ada satu harga, akses tautan properti tersembunyi, validasi publikasi, tindakan tarik ke Draft, zona waktu, serta target kualitas terukur. Filter kamar telah dihapus dari cakupan. Teknologi, hosting, domain, biaya, dan jadwal pembangunan belum dipilih.

Wireframe mobile publik dan beranda admin telah ditinjau. Tahap berikutnya adalah desain visual dan penyesuaian responsif desktop, kemudian implementasi berdasarkan keputusan produk ini. Simulasi wireframe belum memiliki autentikasi, penyimpanan server, atau integrasi pembayaran.