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
