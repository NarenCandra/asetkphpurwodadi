import {check} from './domain.mjs';

export function storageKey(env = process.env) {
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  check(key, 'Konfigurasi penyimpanan Supabase belum lengkap di Netlify.', 503);
  let legacyRole;
  if (key.startsWith('eyJ')) {
    try { legacyRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role; } catch { /* rejected below */ }
  }
  check(key.startsWith('sb_secret_') || legacyRole === 'service_role',
    'Key Storage Netlify harus Secret key (sb_secret_...), bukan publishable/anon key. Periksa SUPABASE_SECRET_KEY pada konteks Production, lalu deploy ulang.', 503);
  return key;
}
