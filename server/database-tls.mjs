import {rootCertificates} from 'node:tls';
import {X509Certificate} from 'node:crypto';
import {supabaseCa} from './supabase-ca.mjs';

export function databaseTls(hostname, customCa = '') {
  if (['127.0.0.1','localhost','[::1]'].includes(hostname)) return false;
  const ca = [...rootCertificates];
  // Trust the Supabase CA only for Supabase database hosts. Keep standard roots
  // as well: the shared pooler may use a certificate from a public authority.
  if (hostname.endsWith('.supabase.co') || hostname.endsWith('.pooler.supabase.com')) ca.push(supabaseCa);
  if (customCa.trim()) {
    const normalized = customCa.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').replace(/\\r\\n|\\n/g, '\n');
    const certificates = normalized.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    try {
      if (!certificates?.length) throw new Error('Missing PEM');
      for (const certificate of certificates) new X509Certificate(certificate);
    } catch {
      const error = new Error('DATABASE_CA_CERT tidak valid. Isi dengan sertifikat PEM lengkap atau hapus variabel ini untuk memakai CA Supabase bawaan.');
      error.status = 503;
      throw error;
    }
    ca.push(...certificates);
  }
  return {rejectUnauthorized:true,ca};
}
