# PRD versi 0.3

Sumber: PRD_Sewa_Rumah_Perhutani_Purwodadi_v0_3.docx. Salinan teks untuk acuan desain.

PRD Website Penyewaan Rumah

Versi 0.3 • 2 November 2026 • Opset Perhutani KPH Purwodadi

Dokumen ini menetapkan kebutuhan website penyewaan rumah yang dikelola Opset Perhutani KPH Purwodadi. Katalog tetap terbuka, sedangkan pengajuan survei memerlukan akun penyewa. Website menyimpan berkas dan riwayat pengajuan; jadwal survei serta pembayaran tetap dikoordinasikan melalui WhatsApp.

Versi 0.3 menambahkan akun penyewa, penggunaan ulang KTP terverifikasi, Surat Permohonan Baru Sewa, Surat Permohonan Perpanjangan Sewa, dan verifikasi manual admin. Penandatanganan tetap dilakukan di luar website. Pengembangan tanah dan ruko serta surat perjanjian tidak termasuk cakupan saat ini. Bagian usulan penerapan ditandai secara eksplisit.

1 Tujuan dan pengguna

Memudahkan calon penyewa menemukan rumah utuh di beberapa kawasan, mengajukan survei, dan melengkapi permohonan sewa. Membantu pengelola menjaga katalog akurat, memverifikasi berkas secara terpusat, serta mengurangi pengumpulan ulang KTP ketika perpanjangan.

Penyampaian bersifat universal untuk berbagai calon penyewa. Website tidak memiliki kategori hunian atau usaha dan tidak menyatakan bahwa setiap rumah dapat digunakan untuk semua jenis usaha. Kesesuaian kebutuhan dibahas melalui WhatsApp dan survei.

2 Cakupan versi awal

Termasuk

Di luar cakupan

Katalog dan detail rumah; filter; harga terbuka; alamat lengkap dan Google Maps.

Pembayaran online, checkout, dan konfirmasi pembayaran otomatis.

Akun penyewa; pengajuan survei tercatat, lalu dilanjutkan ke satu kontak WhatsApp.

Kalender survei, pemilihan jadwal otomatis, dan konfirmasi jadwal otomatis.

Satu akun admin; pengelolaan rumah, berkas privat, verifikasi manual, pengajuan, dan masa sewa.

Banyak pemilik, banyak akun staf, dan verifikasi KTP otomatis.

Dua template permohonan; unduh, tanda tangan di luar web, unggah kembali; perpanjangan dan penanda akhir sewa.

Tanda tangan digital di website, surat perjanjian, pembuatan surat otomatis, ulasan, favorit, dan notifikasi otomatis.

3 Ukuran keberhasilan

Versi awal berhasil jika pengunjung dapat menemukan rumah, penyewa dapat mengajukan survei setelah login dan mengunggah berkas sesuai tahap, serta admin dapat memverifikasi dan mengelola riwayat sewa. Perpanjangan menggunakan kembali KTP yang masih sesuai. Klik WhatsApp, dokumen diterima, dan pembayaran lunas merupakan kejadian yang berbeda.

4 Struktur halaman dan pengalaman

Halaman

Isi utama

Landing page publik

Pembuka dengan tombol Jelajahi Rumah, foto utama, pengenalan singkat, Rumah Tersedia, lalu footer. Katalog dibuka melalui tombol atau navigasi.

Daftar Rumah

Katalog; filter kawasan dan periode; slider rentang harga pada bagian tersendiri; pengurutan harga; status. Tanpa filter kamar tidur.

Detail Rumah

Galeri, spesifikasi, harga, minimum sewa, alamat, Google Maps, dan tombol pengajuan survei dengan pemeriksaan login.

Tentang dan Kontak

Profil pengelola, wilayah layanan, nomor WhatsApp, dan jam layanan.

Login Admin

Akses satu akun pengelola; setelah login masuk Beranda Admin. Penyewa memakai alur daftar dan login terpisah.

Beranda Admin

Ringkasan status rumah, masa sewa perlu perhatian, serta akses pengelolaan rumah dan pengajuan.

Kelola Rumah

Daftar properti, tambah dan edit, pengelolaan foto, harga, penayangan, status, serta catatan tanggal sewa.

Arah visual

Arah visual tetap minimalis modern. Identitas pengelola adalah Opset Perhutani KPH Purwodadi; nama layanan resmi belum ditetapkan. Judul publik tetap “Temukan Rumah Sewa Sesuai Kebutuhan Anda”. Palet konsep logo menggunakan hijau tua dengan aksen hijau muda; bentuk dan penerapan identitas final diselaraskan dengan pengelola.

Alur pengunjung

Landing page → katalog → detail rumah → login atau daftar → kembali ke rumah yang dipilih → konfirmasi pengajuan survei → nomor referensi tersimpan → lanjut ke WhatsApp → survei → pengajuan sewa dan kelengkapan dokumen. Harga, DP, dan pelunasan dibicarakan melalui WhatsApp; admin memperbarui status secara manual.

Tombol dan isi WhatsApp

Tombol “Jadwalkan Survei via WhatsApp” pada rumah Tersedia memeriksa login. Setelah login, pengguna kembali ke rumah yang sama dan mengonfirmasi pengajuan. Sistem menyimpan nomor referensi sebelum menampilkan Lanjut ke WhatsApp. Tidak ada formulir jadwal survei atau kewajiban KTP pada tahap ini.

Contoh pesan: “Halo, saya [nama penyewa], ingin menjadwalkan survei Rumah Melati (RM-001). Nomor pengajuan saya [nomor referensi]. Tautan rumah: [tautan detail]. Mohon informasi jadwal yang tersedia.”

Membuka WhatsApp tidak mengonfirmasi jadwal, pemesanan, atau pembayaran. Admin menyepakati jadwal melalui chat dan mencatat konfirmasinya pada pengajuan. Pengajuan tidak boleh ditandai Terjadwal hanya berdasarkan klik WhatsApp.

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

Semua pengajuan survei memerlukan akun penyewa. Nomor referensi dan identitas rumah dibawa ke satu WhatsApp pengelola. Pengajuan tampil di Pengajuan Saya. Rumah Dipesan tetap tampil, tetapi pengajuan survei nonaktif. Kontak umum tetap tersedia tanpa menganggap percakapan umum sebagai pengajuan survei.

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

Saat menandai Tersewa, admin menghubungkan rumah dengan penyewa dan pengajuan yang disetujui, kemudian mencatat periode aktif, tanggal mulai, dan tanggal akhir. Periode aktif berbeda dari pilihan penawaran. Penyewa dapat melihat masa sewanya sendiri melalui Sewa Saya; data penyewa dan tanggal tidak tampil di katalog publik.

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

Ambang 7 dan 30 hari tetap berlaku. Perpanjangan disimpan sebagai catatan periode baru yang terhubung dengan sewa sebelumnya. Tanggal akhir aktif diperbarui setelah perpanjangan disetujui dan pembayaran terkait dikonfirmasi admin; riwayat lama tidak ditimpa. Tidak ada perubahan status atau notifikasi otomatis.

Beranda admin dan revisi wireframe

ADM 04 Halaman awal setelah login

Setelah login berhasil, admin masuk ke Beranda Admin. Navigasi Beranda Admin dan Kelola Rumah tetap dapat dijangkau pada halaman daftar, formulir, dan pengelolaan status. Halaman awal admin berfungsi sebagai ringkasan operasional sebelum membuka daftar properti.

Ringkasan status rumah

Tampilkan jumlah rumah Tersedia, Dipesan, Tersewa, dan Draft berdasarkan data aktual. Memilih salah satu ringkasan membuka Kelola Rumah dengan filter status tersebut. Angka diperbarui setelah properti atau status berubah; tidak menampilkan pemasukan maupun statistik transaksi.

Akses tindakan dan perhatian

Sediakan Tambah Rumah, Kelola Rumah, dan akses Kelola Pengajuan dan Dokumen. Daftar Perlu Perhatian menampilkan rumah Segera Berakhir atau Perlu Ditinjau dengan tanggal akhir dan akses Kelola Masa Sewa. Cuplikan rumah menyediakan Edit Rumah dan Lihat Semua. Dokumen yang menunggu verifikasi dapat diakses dari daftar pengajuan.

Alur admin

Login admin → Beranda Admin → Kelola Rumah atau Kelola Pengajuan dan Dokumen. Admin meninjau permohonan, memberi alasan perbaikan, menyediakan surat siap tanda tangan, memeriksa hasil unggahan, serta mengonfirmasi pembayaran dan masa sewa. Penanda akhir sewa tidak menayangkan rumah kembali secara otomatis.

Landing page publik yang disepakati

Urutan konten: navigasi → pembuka → pengenalan singkat → Rumah Tersedia → footer. Pembuka memuat judul, uraian singkat, foto, dan tombol Jelajahi Rumah. Bagian Rumah Tersedia memuat cuplikan properti serta akses Lihat Semua ke katalog. Pencarian dan filter berada pada katalog.

Bagian Cara Menyewa, FAQ, dan tombol tambahan di bawah Rumah Tersedia dihapus dari landing page. Baris promosi “Harga terbuka · Bisa nego · Survei sebelum sewa” juga dihapus. Ketentuan survei, DP, dan negosiasi tetap dijelaskan di detail rumah.

Catatan perubahan versi 0.3

Keputusan versi 0.2 tetap berlaku: slider harga terpisah, tanpa filter kamar, landing page ringkas, dan Beranda Admin. Versi 0.3 memperluas layanan menjadi pengajuan sewa dengan akun penyewa, dokumen privat, verifikasi admin, dan perpanjangan. Kebutuhan baru dirinci pada bagian 11 sampai 14.

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

Pengajuan dan pelaksanaan survei tidak mengubah status rumah Tersedia. Setelah DP dikonfirmasi, rumah ditahan untuk pembayarnya. Verifikasi dokumen, persetujuan permohonan, konfirmasi pembayaran, dan status rumah merupakan catatan terpisah. Admin hanya mengaktifkan sewa setelah persyaratan pengajuan terpenuhi dan pelunasan diverifikasi.

Kendali pengelola

Website tidak membaca chat atau rekening secara otomatis. Admin memverifikasi DP dan pelunasan di luar sistem, lalu mencatat hasil konfirmasinya pada pengajuan terkait. Status dokumen yang diterima tidak mengonfirmasi pembayaran. Pembukuan nominal dan integrasi pembayaran tetap di luar cakupan.

Usulan penerapan: sediakan tindakan sembunyikan ke Draft untuk menarik rumah dari penawaran tanpa menghapus datanya. Perubahan yang dapat membuka penawaran kembali perlu konfirmasi agar rumah tidak terpublikasi akibat salah klik.

8 Kebutuhan kualitas yang diusulkan

Responsif pada ponsel dan desktop. Navigasi, label status, filter, dan tombol dapat digunakan dengan keyboard; status dibedakan melalui teks selain warna. Foto dioptimalkan dan konten tidak meluap pada layar kecil.

Hanya admin dapat mengubah properti dan melakukan verifikasi. Penyewa hanya dapat membaca pengajuan, KTP, surat, dan masa sewa miliknya sendiri. Pemeriksaan akses dilakukan pada pengambilan data dan unduhan dokumen, bukan hanya antarmuka. Dokumen tersimpan privat; alamat tautan publik permanen tidak digunakan untuk berkas penyewa. Cadangan dan pemulihan data direncanakan sebelum peluncuran.

9 Kriteria penerimaan versi awal

ID

Skenario dan hasil yang diharapkan

AC 01

Rumah hanya bulanan tidak muncul pada hasil filter tahunan; rumah dengan kedua periode muncul pada keduanya.

AC 02

Slider minimum dan maksimum memakai harga sesuai periode; nilai rupiah tampil, hasil mengikuti rentang inklusif, dan perubahan periode mereset batas. Minimum sewa terlihat di detail.

AC 03

Klik survei tanpa login mengarah ke autentikasi, lalu kembali ke rumah asal. Setelah konfirmasi, nomor pengajuan tersimpan dan dibawa ke WhatsApp.

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

Perpanjangan menyimpan periode baru setelah persetujuan dan konfirmasi pembayaran; riwayat periode sebelumnya tidak ditimpa. Tanggal sewa terlihat hanya oleh admin dan penyewa terkait.

AC 11

Pengunjung tanpa login tidak dapat mengubah properti. Alur pencarian dan detail dapat digunakan di ponsel serta desktop.

AC 12

Landing page mengikuti urutan pembuka, pengenalan, Rumah Tersedia, footer. Tombol Jelajahi Rumah membuka katalog; Cara Menyewa, FAQ, dan baris promosi yang dihapus tidak tampil.

AC 13

Filter harga terpisah dari kawasan dan periode. Tidak ada filter kamar tidur; spesifikasi jumlah kamar tetap tampil pada kartu dan detail.

AC 14

Login admin mengarah ke Beranda Admin; login penyewa mengembalikan konteks rumah atau membuka area akun. Ringkasan admin dan tindakan pengelolaan berfungsi.

10 Hal yang masih perlu ditinjau bersama

Pengelola telah ditetapkan sebagai Opset Perhutani KPH Purwodadi dan objek versi awal hanya rumah utuh. Nama layanan resmi, nomor WhatsApp, jam layanan, data rumah asli, serta dua template resmi permohonan perlu disediakan pengelola. Jangan mengisi identitas atau ketentuan dokumen resmi dengan data fiktif.

Keputusan penerapan yang masih perlu ditetapkan: metode login dan pemulihan akun, batas format/ukuran unggahan, langkah slider, zona waktu, retensi dokumen, penanganan penyewa lama yang belum memiliki akun, serta syarat dan waktu pengajuan perpanjangan. Urutan operasional tanda tangan terhadap DP/pelunasan mengikuti prosedur pengelola, bukan diasumsikan oleh sistem.

Wireframe publik dan admin sebelumnya belum mencakup modul akun dan berkas. Perlu wireframe tambahan untuk Daftar/Login, Profil dan Dokumen Saya, Pengajuan Saya, Sewa Saya, dan Kelola Pengajuan dan Dokumen. Penambahan ini mengubah cakupan pembangunan; biaya dan jadwal perlu dievaluasi ulang sebelum implementasi modul baru.

11 Akun penyewa dan pengajuan survei

AKN 01 Pendaftaran bertahap

Pendaftaran meminta nama, nomor WhatsApp, dan kredensial login. KTP tidak wajib untuk membuat akun atau mengajukan survei. Penyewa dapat melengkapi Dokumen Saya lebih awal, tetapi KTP baru wajib pada tahap pengajuan sewa. Metode autentikasi rinci ditetapkan pada tahap implementasi.

AKN 02 Area akun

Halaman

Fungsi

Profil dan Dokumen Saya

Identitas akun, nomor WhatsApp, unggah KTP, status verifikasi, dan alasan perbaikan.

Pengajuan Saya

Daftar pengajuan survei, baru sewa, dan perpanjangan; detail rumah, nomor referensi, status, dokumen, dan tindakan berikutnya.

Sewa Saya

Rumah yang disewa, periode dan tanggal aktif, riwayat sewa, serta akses Ajukan Perpanjangan.

Detail Pengajuan

Unduh surat siap tanda tangan, unggah hasil tanda tangan, baca keputusan admin, dan lanjut ke WhatsApp dengan konteks pengajuan.

SUR 01 Simpan pengajuan sebelum membuka WhatsApp

Pengguna memilih rumah Tersedia, login jika diperlukan, kembali ke rumah asal, lalu mengonfirmasi pengajuan survei. Sistem membuat nomor referensi dan menyimpan pemilik akun, rumah, waktu pengajuan, serta status awal. Lanjut ke WhatsApp membuka pesan otomatis berisi referensi, nama penyewa, kode dan tautan rumah.

Usulan penerapan: cegah pembuatan pengajuan survei aktif ganda untuk akun dan rumah yang sama. Klik ulang membuka pengajuan yang ada. Admin mengonfirmasi jadwal melalui chat lalu mencatatnya di website. Membuka WhatsApp tidak mengubah status rumah atau menjamin jadwal.

SUR 02 Kelanjutan setelah survei

Setelah survei, pengguna melanjutkan ke permohonan baru sewa pada rumah yang sama. Pengajuan baru menghubungkan dokumen serta profil yang benar. Ketersediaan rumah diperiksa kembali sebelum menerima kelanjutan pengajuan; pengajuan survei bukan jaminan pemesanan.

12 Dokumen dan dua template permohonan

Dokumen

Letak dan aturan penggunaan

KTP

Milik profil penyewa. Verifikasi manual; digunakan kembali selama datanya sesuai. Perubahan memerlukan pemeriksaan ulang.

Surat Permohonan Baru Sewa

Template resmi untuk pengajuan pertama. Hasil tanda tangan terhubung ke pengajuan dan rumah terkait.

Surat Permohonan Perpanjangan Sewa

Template resmi berbeda untuk perpanjangan. Hasil tanda tangan terhubung ke sewa sebelumnya dan periode baru yang diajukan.

DOK 01 Penyediaan dan penandatanganan surat

Admin menyediakan dua template dari pengelola. Untuk setiap pengajuan, admin mengisi template yang sesuai secara manual lalu mengunggah versi siap tanda tangan. Penyewa mengunduh dari detail pengajuan, menandatangani di luar website, lalu mengunggah hasilnya pada pengajuan yang sama. Admin memeriksa dokumen dan menerima atau meminta perbaikan dengan alasan.

Rincian yang diisi mengikuti template resmi. Website tidak membuat klausul, perjanjian baru, atau tanda tangan digital. Pembuatan surat otomatis berada di luar cakupan versi ini. Surat permohonan bukan surat perjanjian; surat perjanjian tidak termasuk jenis dokumen yang dikelola saat ini.

DOK 02 Status dan perbaikan

Status dokumen: Belum Diunggah, Menunggu Verifikasi, Terverifikasi atau Diterima, dan Perlu Perbaikan. Gunakan Terverifikasi untuk KTP dan Diterima untuk surat. Alasan perbaikan terlihat pada berkas terkait. Penyewa dapat mengganti berkas yang perlu diperbaiki dan mengirimkannya kembali untuk diperiksa.

Usulan penerapan: simpan versi berkas dan catatan keputusan, bukan menimpa file lama tanpa jejak. KTP yang pernah digunakan direferensikan dengan versi dokumennya agar riwayat permohonan tetap jelas ketika profil diperbarui.

DOK 03 Akses dan penyimpanan

KTP dan surat privat hanya dapat diakses penyewa pemiliknya serta admin. Unduhan memeriksa hak akses. Validasi berkas di server, batasi ukuran serta format, dan tampilkan kegagalan unggah tanpa menghapus berkas lama. Format dan batas ukuran ditetapkan sebelum implementasi. Data identitas tidak ditampilkan di katalog atau pesan WhatsApp otomatis.

13 Perpanjangan dan pengelolaan admin

PNJ 01 Pengajuan dari sewa yang tercatat

Penyewa membuka Sewa Saya, memilih sewa terkait, dan mengajukan perpanjangan. Sistem menghubungkan pengajuan ke sewa sebelumnya. KTP terverifikasi dipakai kembali jika data masih sesuai; penyewa tidak diminta unggah ulang secara otomatis. Jika identitas berubah atau admin meminta perbaikan beralasan, KTP diperbarui dan diperiksa ulang.

Admin menyiapkan Surat Permohonan Perpanjangan Sewa dari template berbeda. Penyewa mengunduh, menandatangani di luar website, serta mengunggah hasilnya. Harga, periode baru, dan pembayaran dibicarakan melalui WhatsApp. Kelayakan dan rentang waktu pengajuan perpanjangan mengikuti ketentuan pengelola yang masih perlu ditetapkan.

PNJ 02 Pertahankan riwayat periode

Perpanjangan adalah catatan baru, bukan penggantian catatan lama. Hubungkan penyewa, rumah, pengajuan, referensi KTP, surat yang diterima, periode sebelumnya, dan periode baru. Setelah keputusan dan pembayaran dikonfirmasi admin, tanggal akhir aktif dapat diperbarui tanpa menghilangkan riwayat. Pengajuan perpanjangan sendiri tidak memperpanjang sewa secara otomatis.

ADM 05 Kelola pengajuan dan dokumen

Admin melihat daftar pengajuan menurut jenis, penyewa, rumah, dan status. Detail pengajuan menyediakan akses KTP privat, surat siap tanda tangan, unggahan hasil tanda tangan, alasan perbaikan, keputusan permohonan, dan catatan konfirmasi pembayaran. Pemeriksaan dan perubahan status dilakukan manual oleh satu akun admin.

Catatan terpisah

Makna

Dokumen

Kelengkapan serta hasil verifikasi KTP dan surat.

Pengajuan

Permohonan masih diproses, memerlukan perbaikan, disetujui, atau ditolak; status rinci merupakan usulan penerapan.

Pembayaran

Belum dikonfirmasi, DP dikonfirmasi, atau pelunasan dikonfirmasi admin; tidak terhubung otomatis ke bank.

Rumah dan sewa

Ketersediaan rumah, penyewa yang terikat, dan masa sewa aktif; mengikuti keputusan pengelola.

KTP terverifikasi atau surat Diterima tidak otomatis menyetujui permohonan. Persetujuan permohonan tidak otomatis menandai pembayaran lunas. Konfirmasi satu DP tidak boleh menahan rumah yang sama untuk dua pengajuan berbeda.

14 Kriteria penerimaan modul tambahan

ID

Skenario dan hasil yang diharapkan

AC 15

Pendaftaran dapat diselesaikan tanpa KTP. Katalog dan detail tetap dapat dibuka tanpa login.

AC 16

Klik survei tanpa login mempertahankan konteks rumah. Setelah login dan konfirmasi, nomor pengajuan tersimpan sebelum WhatsApp dibuka.

AC 17

Pengajuan survei tidak meminta KTP dan tidak otomatis mengonfirmasi jadwal atau mengubah status rumah.

AC 18

Permohonan baru sewa meminta kelengkapan KTP. Admin dapat memverifikasi atau meminta perbaikan dengan alasan yang terlihat oleh penyewa.

AC 19

Admin menyediakan dua template berbeda. Dokumen siap tanda tangan dan hasil unggahan terhubung ke pengajuan yang benar.

AC 20

Penyewa A tidak dapat membaca atau mengunduh KTP, surat, pengajuan, dan masa sewa milik penyewa B, termasuk melalui tautan langsung.

AC 21

Perpanjangan menggunakan KTP terverifikasi yang masih sesuai; tidak meminta unggah ulang tanpa perubahan atau permintaan perbaikan.

AC 22

Surat perpanjangan disimpan pada pengajuan baru; surat dan periode sebelumnya tetap tersedia sebagai riwayat.

AC 23

Dokumen Diterima tidak menandai pembayaran lunas. Pengajuan perpanjangan belum disetujui tidak mengubah tanggal akhir aktif.

AC 24

Konfirmasi pelunasan serta aktivasi sewa ditangani admin dan terhubung dengan penyewa, rumah, serta pengajuan yang tepat.

Pemeriksaan sebelum implementasi

Pastikan pengelola menyediakan dua template resmi, menetapkan petugas verifikasi, dan mengonfirmasi urutan tanda tangan terhadap DP serta pelunasan. Tetapkan mekanisme akun, pemulihan akses, format unggahan, retensi berkas, dan pencatatan sewa lama. Detail yang belum diputuskan tidak dianggap sebagai ketentuan resmi Perhutani.

Dampak terhadap cakupan

Website kini mencakup area penyewa dan administrasi dokumen, bukan hanya katalog dengan kontak WhatsApp. Tambahan layar, autentikasi, penyimpanan privat, riwayat, dan pengujian akses perlu masuk estimasi pekerjaan. Tidak ada asumsi bahwa pembayaran daring atau tanda tangan di dalam website ikut ditambahkan.
