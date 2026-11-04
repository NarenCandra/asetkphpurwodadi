"""Server khusus tes E2E Playwright: database sementara, data contoh, akun admin uji.

Tidak menyentuh data aplikasi (data/). Kredensial uji hanya ada selama server berjalan.
"""
import os
import sys
import tempfile
from pathlib import Path

os.environ['LOCAL_ADMIN_DEMO'] = 'false'
os.environ['WHATSAPP_NUMBER'] = '6281234567890'  # nomor contoh agar tautan WhatsApp aktif
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import secrets

import app
from seed import seed_demo

PORT = int(os.environ.get('E2E_PORT', '8765'))
USER = os.environ.get('E2E_ADMIN_USER', 'e2e-admin')
PASSWORD = os.environ.get('E2E_ADMIN_PASSWORD', 'e2e-password-123456')

with tempfile.TemporaryDirectory() as directory:
    app.DATA = Path(directory)
    app.DB = app.DATA / 'catalog.sqlite3'
    app.init_db()
    seed_demo()
    salt = secrets.token_hex(16)
    with app.connect() as db:
        db.execute('INSERT INTO admin VALUES(1,?,?,?)', (USER, salt, app.password_hash(PASSWORD, salt)))
    server = app.ThreadingHTTPServer(('127.0.0.1', PORT), app.Handler)
    print(f'E2E server siap di http://127.0.0.1:{PORT}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
