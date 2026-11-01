# Foto demonstrasi

Foto tanah kosong menggantikan ilustrasi SVG pada katalog dan galeri:

- `land-1.jpg`: foto lahan terbuka, [sumber Unsplash](https://images.unsplash.com/photo-1500382017468-9049fed747ef).
- `land-2.jpg`: foto udara lahan dengan penanda bidang, [sumber artikel Rumah123](https://artikel.rumah123.com/cara-jual-tanah-kosong-yang-nganggur).

Foto ini hanya pelengkap data dummy; bukan dokumentasi atau batas bidang aset Perhutani.

Foto rumah klasik Indonesia digunakan sebagai ilustrasi demonstrasi, tanpa menyatakan bahwa foto memperlihatkan properti yang ditawarkan. Sumber:

- `house-1.jpg`: rumah joglo kayu — [Indonesia Design](https://indonesiadesign.com/story/the-history-of-java-vernacular-residential-architecture-simplified).
- `house-2.jpg`: rumah limasan dengan taman — [Limasan Candi Gebang](https://www.airbnb.fr/rooms/22753258).
- `house-3.jpg`: rumah bergaya kolonial tropis — [Rumah123](https://www.rumah123.com/panduan-properti/desain-rumah-belanda/).

Skrip opsional `python scripts/download_demo_photos.py` mengunduh JPEG sebelum seed dijalankan. Opsi `--apply-demo` juga memperbarui foto properti demonstrasi yang sudah tersimpan, mempertahankan ID dan urutan foto, serta mencadangkan foto sebelumnya ke `test-results/photos-before-classic-*`. Tanpa JPEG, seed menggunakan ilustrasi SVG lokal yang dibuat untuk proyek ini. Unggahan admin tidak menerima SVG.

Ganti foto dan data contoh dengan aset properti milik pengelola sebelum peluncuran. Foto di `demo/` berbeda dari penyimpanan runtime `data/uploads/`.
