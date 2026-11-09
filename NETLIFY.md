# Netlify + Supabase (aplikasi aktif)

Website dan API berjalan di Netlify. Database Postgres dan dua bucket privat
berjalan di project Supabase `bgiadvrfxqftgzmssvqy` (sewaasetkph).
API JavaScript di `server/` menjalankan kontrak API aplikasi Python lokal,
termasuk hash kata sandi scrypt, cookie sesi HttpOnly, dan token CSRF.
Akun admin dan penyewa yang sudah ada tetap dipakai. Ini tidak memakai
Supabase Auth, dan tidak perlu menjalankan `supabase_schema.sql`.

Untuk pengajuan sewa baru dan perpanjangan, konfirmasi pembayaran **Lunas**
otomatis menyimpan status pengajuan **Selesai**. KTP tetap harus terverifikasi
dan surat bertanda tangan harus diterima sebelum persetujuan/pelunasan.
Pencatatan tanggal aktivasi atau perpanjangan tetap dilakukan admin sesudahnya;
status Selesai tidak mengisi tanggal sewa atau menutup akses pencatatan periode.

## Pengaturan satu kali

1. Di Supabase buka project **sewaasetkph > Connect > Transaction pooler**.
   Salin URI PostgreSQL yang benar, termasuk hostname pooler yang ditampilkan,
   user `postgres.bgiadvrfxqftgzmssvqy`, port 6543, dan database `postgres`.
   Ganti placeholder password dengan password database yang sudah di-URL-encode.
   Password database berbeda dari password akun Supabase dan password login web.
2. Di Netlify buka project **asetkphpurwodadi > Project configuration >
   Environment variables**. Tambahkan variabel berikut dengan scope **Functions**
   (atau semua scope jika paket tidak menyediakan pilihan scope):

   | Variabel | Nilai |
   | --- | --- |
   | `DATABASE_URL` | URI Transaction pooler dari langkah 1 |
   | `SUPABASE_URL` | `https://bgiadvrfxqftgzmssvqy.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key project ini, hanya di server |
   | `TIMEZONE` | `Asia/Jakarta` |
   | `WHATSAPP_NUMBER` | Nomor pengelola asli, digit internasional tanpa `+` |

   Untuk Storage, boleh memakai `SUPABASE_SECRET_KEY` (key `sb_secret_...`)
   sebagai pengganti `SUPABASE_SERVICE_ROLE_KEY`. Jangan gunakan anon/publishable
   key sebagai pengganti kredensial server. Tidak ada secret yang dibutuhkan
   frontend atau build. Jangan menambahkan secret ke file Git, chat, atau `dist/`.
3. CA publik **Supabase Root 2021 CA** sudah disertakan dalam paket API untuk
   hostname database/pooler Supabase, bersama root CA standar Node.js. Variabel
   `DATABASE_CA_CERT` hanya diperlukan untuk CA tambahan/kustom; jika diisi,
   nilainya harus seluruh isi PEM, bukan nama/path file. Verifikasi TLS tetap aktif; jangan
   mengatasinya dengan `NODE_TLS_REJECT_UNAUTHORIZED=0`.
4. Pastikan bucket **asset-photos** dan **tenant-docs** ada dan **private**.
   API hanya memberikan foto publik jika aset Tersedia/Dipesan. Dokumen hanya
   bisa diunduh pemiliknya atau admin. Tidak perlu membuka RLS untuk browser.
5. Commit dan push perubahan ke branch produksi **main**. Netlify membaca:
   - Build command: `node scripts/build-netlify.cjs`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   - Node.js: 22
6. Jalankan deploy baru sesudah mengisi environment variables. Variabel runtime
   perlu redeploy agar diterapkan. Jangan hanya retry deployment demo lama.

## Memeriksa deployment

- Log build harus menampilkan **Production frontend built**, bukan **Static demo built**.
- `/assets/deployment.js` harus berisi `SEWARUMA_STATIC_DEMO = false`.
- `/api/config` mengembalikan JSON; `/api/houses` mengembalikan katalog Supabase.
- `/api/session` mengembalikan `authenticated:false` sebelum login.
- `/admin` menampilkan Login Admin; pakai akun admin database yang sudah ada.
- `/masuk` dan `/daftar` menjalankan akun penyewa, bukan pratinjau demo.
- Jika muncul 503, lihat log **Functions > api** dan cek kredensial runtime.
  Pesan detail/kredensial database tidak dikirim ke browser.

Request unggahan Netlify dibatasi **3 MB per berkas** (foto, PDF/KTP, Excel)
agar JSON/base64 tetap muat dalam batas payload Functions. Lokal Python tetap
memakai batas sebelumnya. File privat tidak pernah disalin ke output build.

## Menjalankan versi Netlify di komputer

```powershell
npm.cmd ci
Copy-Item .env.netlify.example .env.netlify
# Isi .env.netlify secara lokal. File ini diabaikan Git.
npm.cmd run build:netlify
npm.cmd run dev:netlify
```

Buka `http://127.0.0.1:8888`. API dan frontend memakai origin yang sama, sehingga
cookie dan perlindungan CSRF berlaku seperti deployment Netlify. `.env` Python
tidak otomatis dimuat; gunakan `.env.netlify` khusus pengujian versi ini.

Untuk pengujian otomatis, gunakan Postgres lokal **khusus tes**:

```powershell
$env:NETLIFY_TEST_DATABASE_URL='postgresql://USER@127.0.0.1:PORT/postgres'
npm.cmd run test:netlify
```

Tes membuat dan membersihkan schema sementara. URL database nonlokal ditolak.
Tanpa variabel itu, pengujian integrasi ditandai skip, bukan dilaporkan lulus.
Tes Storage memakai transport tiruan, bukan mengunggah KTP ke Supabase asli.

Demo statis tetap dapat dibuat dengan `npm.cmd run build:demo` untuk kebutuhan
pratinjau terpisah; hasilnya tidak digunakan konfigurasi produksi Netlify.

## Catatan 5 Nov 2026

- Unggah berkas: bila bucket `tenant-docs` / `asset-photos` belum ada di Supabase, API kini membuatnya otomatis (privat) lalu mengulang unggahan. Penyebab error sebenarnya dicatat di log Netlify Functions (`Supabase Storage gagal: ...`).
- Status **Selesai** otomatis diset saat pelunasan dikonfirmasi. Untuk data lama yang sudah Lunas tetapi masih Disetujui, jalankan sekali di Supabase SQL Editor:

```sql
UPDATE applications SET status='selesai'
WHERE kind <> 'survei' AND payment='lunas' AND status='disetujui';
```

## Impor otomatis (konversi ke template)

Halaman Admin > Impor Excel punya bagian **Impor otomatis**. Format Excel bebas: judul kolom dikenali dengan aturan (termasuk judul dua baris dan salah ketik ringan); kolom yang tidak dikenal dipetakan oleh Claude API bila variabel **ANTHROPIC_API_KEY** diisi di Netlify (opsional: ANTHROPIC_MODEL, default claude-sonnet-4-6). Tanpa key, kolom tak dikenal dilewati. AI hanya memetakan judul kolom; isi data tidak pernah diubah oleh AI. Template: `public/assets/template-impor-aset.xlsx`. Foto belum diimpor otomatis.

### Foto dan filter katalog

- Foto di lembar kerja lain (gambar melayang) dibaca di browser: lembar `1. nama`, `2. nama`, dst. dicocokkan ke aset lewat angka = kolom No., kolom Foto, atau kemiripan nama; bisa diubah di pratinjau sebelum impor. Foto dikecilkan (maks. 1600 px) dan diunggah ke aset yang belum punya foto. Gambar "Place in Cell" belum didukung.
- Filter katalog: Periode sewa, Jenis aset, Kawasan. Kawasan = kecamatan yang dibaca dari alamat ("Kec. X" / "Kecamatan X"), daftar pilihan dibentuk dari data yang ada. Jenis aset = Rumah / Lahan / Gudang/TPK / Kantor/Gedung / Lainnya, ditebak dari jenis dan nama aset; bisa diganti per aset di form admin ("Jenis aset untuk filter").

### Server lokal (Python) dan Netlify (Node)

Impor otomatis ada di dua backend: `importconv.py` (untuk `python app.py serve`, localhost:8000) dan `server/convert.mjs` + `server/importer.mjs` (Netlify). Logikanya sama. Jalankan ulang server Python setelah menimpa file. Baris penomoran kolom (1, 2, 3, ...) di bawah judul dilewati, dan bila Excel punya banyak lembar, lembar dengan judul kolom paling cocok yang dipakai (atau isi kolom "Lembar kerja").

### Performa dan panel samping (6 Nov 2026)

- Server Python: koneksi Postgres dipakai ulang lewat kolam kecil (`db.py`), karena membuka koneksi baru ke Supabase di setiap request lambat (terutama bila region database jauh dari pengguna; saat ini London). Foto disimpan di cache memori server dan di browser (`Cache-Control: private, max-age=604800`), berkas `/assets/*` memakai ETag sehingga pindah halaman memakai balasan 304 yang cepat. Netlify: foto juga diberi cache browser.
- Untuk percepatan lebih lanjut: pindahkan proyek Supabase ke region Singapura (`ap-southeast-1`); region tidak dapat diubah pada proyek yang sudah ada, jadi perlu proyek baru + pemindahan data.
- Form edit aset: panel samping (Status penayangan, Masa sewa internal) tetap menempel dan dapat di-scroll sendiri bila lebih tinggi dari layar (`account.css`).
