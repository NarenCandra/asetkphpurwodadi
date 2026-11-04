-- =====================================================================
-- Sewa Aset Perhutani KPH Purwodadi : skema Supabase (PRD v0.3)
-- Jalankan di Supabase > SQL Editor. BELUM diuji di project nyata.
-- Admin pertama: daftar lewat web, lalu jalankan manual:
--   update profiles set role='admin' where id = '<uuid-user>';
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helper ---------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  whatsapp text not null,
  role text not null default 'penyewa' check (role in ('penyewa','admin')),
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profil otomatis saat user mendaftar (nama & WA dikirim via metadata signUp)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nama, whatsapp)
  values (new.id, coalesce(new.raw_user_meta_data->>'nama',''),
          coalesce(new.raw_user_meta_data->>'whatsapp',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- aset (rumah) ---------------------------------------------
create table assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                    -- kode publik, mis. RM-001
  name text not null,
  description text,
  kawasan text,
  address text,
  maps_url text,
  luas_tanah numeric,                           -- m2
  luas_bangunan numeric,                        -- m2
  kamar_tidur int, kamar_mandi int,
  fasilitas text[] default '{}',
  harga_bulanan bigint, min_bulanan int,        -- min dalam bulan
  harga_tahunan bigint, min_tahunan int,        -- min dalam tahun
  ketentuan text, biaya_tambahan text,
  status text not null default 'draft'
    check (status in ('draft','tersedia','dipesan','tersewa')),
  -- data internal dari Excel Perhutani (tidak tampil publik)
  no_inventaris text, lokasi text, kondisi text, alas_hak text,
  bentuk_kerja_sama text,
  real_2025 bigint, estimasi_2026 bigint, real_2026 bigint, rencana_2027 bigint,
  keterangan text,
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  path text not null,                           -- bucket 'asset-photos'
  position int not null default 0
);

-- Katalog publik: hanya kolom aman, hanya status tersedia/dipesan.
create view public_assets with (security_invoker = false) as
  select id, code, name, description, kawasan, address, maps_url,
         luas_tanah, luas_bangunan, kamar_tidur, kamar_mandi, fasilitas,
         harga_bulanan, min_bulanan, harga_tahunan, min_tahunan,
         ketentuan, biaya_tambahan, status
  from assets where status in ('tersedia','dipesan');
create view public_asset_photos with (security_invoker = false) as
  select p.id, p.asset_id, p.path, p.position
  from asset_photos p join assets a on a.id = p.asset_id
  where a.status in ('tersedia','dipesan');
grant select on public_assets, public_asset_photos to anon, authenticated;

-- ---------- pengajuan ------------------------------------------------
create sequence pengajuan_seq;
create table applications (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique
    default ('PGJ-' || to_char(now(),'YYYY') || '-' || lpad(nextval('pengajuan_seq')::text,5,'0')),
  jenis text not null check (jenis in ('survei','sewa_baru','perpanjangan')),
  tenant_id uuid not null references profiles(id),
  asset_id uuid not null references assets(id),
  lease_id uuid,                                -- diisi untuk perpanjangan
  status text not null default 'diproses'
    check (status in ('diproses','terjadwal','perlu_perbaikan','disetujui','ditolak','dibatalkan')),
  catatan_admin text,
  pembayaran text not null default 'belum'
    check (pembayaran in ('belum','dp','lunas')),
  pembayaran_catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- cegah survei aktif ganda untuk akun + aset yang sama
create unique index uq_survei_aktif on applications(tenant_id, asset_id)
  where jenis='survei' and status in ('diproses','terjadwal');

-- ---------- dokumen (berversi, privat) --------------------------------
create table document_templates (             -- 2 template resmi, diunggah admin
  jenis text primary key check (jenis in ('sewa_baru','perpanjangan')),
  path text, updated_at timestamptz default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references profiles(id),
  application_id uuid references applications(id),   -- null untuk KTP profil
  tipe text not null check (tipe in ('ktp','surat_siap_ttd','surat_ttd')),
  path text not null,                                -- bucket 'tenant-docs'
  versi int not null default 1,
  status text not null default 'menunggu'
    check (status in ('menunggu','terverifikasi','diterima','perlu_perbaikan')),
  alasan text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- sewa & riwayat periode -------------------------------------
create table leases (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  tenant_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create table lease_periods (                  -- perpanjangan = baris baru
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references leases(id) on delete cascade,
  application_id uuid references applications(id),
  periode text not null check (periode in ('bulanan','tahunan')),
  tanggal_mulai date not null,
  tanggal_akhir date not null check (tanggal_akhir >= tanggal_mulai),
  created_at timestamptz not null default now()
);
alter table applications
  add constraint fk_app_lease foreign key (lease_id) references leases(id);

-- ---------- RLS ------------------------------------------------------
alter table profiles enable row level security;
alter table assets enable row level security;
alter table asset_photos enable row level security;
alter table applications enable row level security;
alter table documents enable row level security;
alter table document_templates enable row level security;
alter table leases enable row level security;
alter table lease_periods enable row level security;

create policy profiles_self on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_upd on profiles for update
  using (id = auth.uid() or is_admin())
  with check (is_admin() or (id = auth.uid() and role = 'penyewa'));

create policy assets_admin on assets for all using (is_admin()) with check (is_admin());
create policy photos_admin on asset_photos for all using (is_admin()) with check (is_admin());

create policy app_read on applications for select using (tenant_id = auth.uid() or is_admin());
create policy app_insert on applications for insert
  with check (tenant_id = auth.uid() and status = 'diproses' and pembayaran = 'belum');
create policy app_admin on applications for update using (is_admin()) with check (is_admin());

create policy doc_read on documents for select using (tenant_id = auth.uid() or is_admin());
create policy doc_insert_tenant on documents for insert
  with check (tenant_id = auth.uid() and tipe in ('ktp','surat_ttd') and status = 'menunggu');
create policy doc_admin on documents for all using (is_admin()) with check (is_admin());

create policy tpl_read on document_templates for select using (auth.uid() is not null);
create policy tpl_admin on document_templates for all using (is_admin()) with check (is_admin());

create policy lease_read on leases for select using (tenant_id = auth.uid() or is_admin());
create policy lease_admin on leases for all using (is_admin()) with check (is_admin());
create policy lp_read on lease_periods for select using (
  is_admin() or exists (select 1 from leases l where l.id = lease_id and l.tenant_id = auth.uid()));
create policy lp_admin on lease_periods for all using (is_admin()) with check (is_admin());

-- ---------- Storage ------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('asset-photos','asset-photos', true),        -- foto katalog (hanya rumah publik)
  ('tenant-docs','tenant-docs', false),         -- KTP & surat: privat
  ('templates','templates', false)
on conflict do nothing;

-- Berkas penyewa: path wajib diawali '<uid>/...'
create policy tdocs_read on storage.objects for select
  using (bucket_id='tenant-docs' and (is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy tdocs_insert on storage.objects for insert
  with check (bucket_id='tenant-docs' and (is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy tdocs_admin on storage.objects for all
  using (bucket_id='tenant-docs' and is_admin()) with check (bucket_id='tenant-docs' and is_admin());

create policy photos_write on storage.objects for all
  using (bucket_id='asset-photos' and is_admin()) with check (bucket_id='asset-photos' and is_admin());
create policy tpl_storage_read on storage.objects for select
  using (bucket_id='templates' and auth.uid() is not null);
create policy tpl_storage_admin on storage.objects for all
  using (bucket_id='templates' and is_admin()) with check (bucket_id='templates' and is_admin());
