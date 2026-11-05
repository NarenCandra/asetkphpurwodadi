import pg from 'pg';

let pool;
export function databasePool() {
  if (!process.env.DATABASE_URL?.trim()) {
    const error = new Error('Konfigurasi DATABASE_URL belum diisi di Netlify.');
    error.status = 503;
    throw error;
  }
  if (!pool) {
    const uri = new URL(process.env.DATABASE_URL);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname);
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) uri.searchParams.delete(key);
    pool = new pg.Pool({
      connectionString: uri.toString(), max: 2, idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000, statement_timeout: 15000,
      ssl: local ? false : {rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? {ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n')} : {})},
    });
    pool.on('error', error => console.error('Database idle connection:', error.code || 'connection_error'));
  }
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}
