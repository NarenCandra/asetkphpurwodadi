# Rancangan PRD 0.3

Acuan: PRD_v0_3.md, disalin dari DOCX pengelola. Pilihan pengguna yang dikonfirmasi: objek tetap bangunan dan tanah kosong, susunan beranda tetap hero penuh tanpa pengenalan, cuplikan aset, atau footer.

## Arah visual

Identitas lembaga, bukan marketplace banyak pemilik. Logo rumah-daun terakhir dipertahankan. Warna utama hijau hutan #164B36, hijau daun #D8EBB5, latar #F4F7F3, putih #FFFFFF, teks #21372A, garis #DBE5DA. Aksen dipakai untuk aksi dan status, bukan mewarnai kata dalam judul.

Tipografi memakai Avenir Next/Segoe UI yang sudah ada. Judul 40?64 px desktop, 32?40 px mobile; teks utama 17?18 px. Konten rata kiri, panjang paragraf maksimal 65 karakter. Foto tetap menjadi identitas publik; panel dokumen mengutamakan keterbacaan dan tindakan.

## Susunan layar

Publik: beranda tetap navbar dan hero foto penuh sesuai pilihan pengguna; nama layanan sementara dan istilah aset dipertahankan. Katalog tetap kawasan + periode dan slider harga terpisah. Tidak ada filter kamar. Detail menampilkan penawaran dan akses survei setelah autentikasi.

Akun desktop: navigasi akun di kiri, isi di kanan. Mobile: navigasi menjadi tautan horizontal yang dapat digulir. Profil/Dokumen Saya, Pengajuan Saya, Sewa Saya, dan Detail Pengajuan dipisahkan. KTP tidak diminta saat daftar atau survei. Surat baru sewa dan perpanjangan adalah dua jenis dokumen yang berbeda; template resmi tidak dibuat dari data contoh.

Admin: ringkasan rumah dan masa sewa, Kelola Rumah, Kelola Pengajuan dan Dokumen. Status dokumen, permohonan, pembayaran, dan penayangan tidak digabungkan. Angka memakai data yang tersedia, tidak ada statistik pemasukan fiktif.

## Batas implementasi desain

Modul akun/dokumen baru berupa pratinjau antarmuka sampai backend autentikasi penyewa, penyimpanan privat, format/ukuran unggahan, pemulihan akun, retensi, serta template resmi ditetapkan. Tidak menyimpan kredensial, KTP, atau surat pada localStorage. Tidak mengklaim login berhasil, pengajuan tersimpan, atau dokumen terverifikasi dari tindakan pratinjau. Backend admin/katalog yang sudah berfungsi dipertahankan.
