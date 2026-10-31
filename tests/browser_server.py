"""Isolated browser QA server. Temporary credentials/data never touch runtime data."""
import json
import secrets
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from seed import seed_demo

with tempfile.TemporaryDirectory() as directory:
    app.DATA = Path(directory)
    app.DB = app.DATA / 'catalog.sqlite3'
    app.init_db()
    seed_demo()
    password = secrets.token_urlsafe(24)
    salt = secrets.token_hex(16)
    with app.connect() as db:
        db.execute('INSERT INTO admin VALUES(1,?,?,?)', ('browser-test', salt, app.password_hash(password, salt)))
    print(json.dumps({'username': 'browser-test', 'password': password}), flush=True)
    server = app.ThreadingHTTPServer(('127.0.0.1', 8001), app.Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
