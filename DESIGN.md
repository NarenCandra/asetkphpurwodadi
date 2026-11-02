> Arah desain terbaru: lihat [DESIGN_v0_3.md](DESIGN_v0_3.md). Catatan berikut menyimpan arah visual awal dan dapat memuat istilah lama.

# Arah visual Sewaruma: Teras Hijau

Acuan kebutuhan: `PRD.md`, dengan revisi pengguna sesudah PRD. Nama usaha adalah Sewaruma. Bagian pengenalan, Rumah Tersedia, dan footer beranda dihapus atas permintaan pengguna; beranda kini hanya navigasi dan hero foto penuh. Katalog tetap diakses melalui Jelajahi Rumah atau navbar. Profil pengelola ada di Tentang & Kontak dan footer tetap ditampilkan pada halaman selain beranda.

## Token utama

| Peran | Warna |
| --- | --- |
| Aksi dan identitas | `#315C41` |
| Kontras gelap | `#203E2C` |
| Latar utama | `#F8FAF6` |
| Latar pengenalan dan kontrol | `#EDF2E9` |
| Pilihan aktif | `#DCE8D0` |
| Teks | `#243A2B` |

Heading menggunakan Avenir Next dengan fallback Segoe UI, bobot sedang dan proporsi terbuka. Body memakai Segoe UI/Helvetica Neue. Label menggunakan sentence case. Harga dibedakan melalui ukuran dan bobot; periode selalu ditulis.

## Komposisi

Landing terbaru menggunakan foto rumah sebagai latar seluruh hero, dengan judul putih rata kiri, deskripsi dan tombol di atasnya. Lapisan kontras menjaga keterbacaan pada desktop dan mobile. Keterangan nama/kawasan foto dan tautan Lihat rumah di bawah hero dihapus sesuai permintaan. Sisa homepage mengikuti palet hero: pengenalan putih, Rumah Tersedia pada latar sage lembut, kartu putih dengan foto memenuhi bagian atas, tombol hijau muda dan footer hijau hutan. Katalog, detail dan admin mempertahankan konsep Teras Hijau.

```text
Landing desktop          Landing mobile
[logo       navigasi]    [logo     menu]
[judul + foto latar ]    [judul + foto ]
[deskripsi + tombol ]    [teks + tombol]
[pengenalan         ]    [pengenalan   ]
[rumah][rumah][rumah]    [rumah        ]
[footer             ]    [rumah        ]
                         [footer       ]
```

Katalog desktop memakai kontrol kawasan/periode dan harga di sisi kiri; mobile menumpuknya sebelum hasil. Tetap hanya tiga filter yang ditetapkan PRD. Rentang terpilih mendapat jalur hijau; angka bulanan dan tahunan tidak dicampur.

Pada desktop, admin memakai tabel. Mobile menyusun sel tabel menjadi baris rumah dengan identitas, kawasan, status, dan akses edit yang terlihat tanpa scroll horizontal. Konten serta akses datanya sama.

## Pembatas desain

Perpindahan halaman memakai efek menimpa selama 0,48 detik: konten baru memudar masuk di atas konten lama tanpa gerakan vertikal. View Transitions API digunakan jika tersedia, dengan fade tanpa perpindahan sebagai fallback. Navigasi maju/mundur didukung dan reduced motion menonaktifkan efek.

Hero menggunakan foto latar penuh selebar viewport dan setinggi layar di bawah navbar (`100svh` dikurangi tinggi navbar). Konten teks tetap dibatasi 1320 px; section berikutnya berada di bawah hero dalam alur scroll biasa.

Foto latar berganti setiap 6 detik dengan crossfade 1,2 detik, memakai maksimal 5 foto utama rumah Tersedia. Jika hanya ada satu rumah, galeri rumah tersebut menjadi sumber berikutnya. Tombol jeda dihapus sesuai permintaan pengguna. Autoplay berhenti saat hero di luar layar, tab tidak aktif, atau reduced motion diaktifkan; timer dibersihkan saat berpindah halaman. Foto baru ditampilkan setelah berhasil dimuat.

Foto hero menjadi fokus visual; tidak menambah dekorasi, section, klaim usaha, atau statistik transaksi. Animasi pembuka hanya satu rangkaian; interaksi lainnya merespons tindakan pengguna dan mengikuti reduced motion. Status selalu memiliki label teks selain warna.

`style.css` berisi struktur dasar, `theme.css` komponen dan animasi, `mobile.css` perilaku responsif. `terrace.css` menjadi lapisan visual aktif terakhir untuk konsep Teras Hijau, termasuk penyesuaian mobile. Hindari mengubah gaya desktop melalui aturan mobile dan periksa sticky panel terhadap tinggi navbar.
