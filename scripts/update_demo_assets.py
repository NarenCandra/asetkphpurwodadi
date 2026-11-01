"""Update existing demo records only, preserving identifiers and internal rental dates."""
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app

templates = {h['code']: h for h in json.loads((app.ROOT / 'demo/houses.json').read_text(encoding='utf-8'))}
backup = app.ROOT / 'test-results' / ('assets-before-update-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True, exist_ok=False)
with app.connect() as source, sqlite3.connect(backup / 'catalog.sqlite3') as target:
    source.backup(target)
count = 0
with app.connect() as db:
    for row in db.execute('SELECT id,code,body FROM houses').fetchall():
        existing = json.loads(row['body'])
        if not existing.get('demo') or row['code'] not in templates:
            continue
        existing.update(templates[row['code']])
        db.execute('UPDATE houses SET body=?,revision=revision+1 WHERE id=?', (json.dumps(existing), row['id']))
        if existing['asset_type'] == 'land':
            for position, photo in enumerate(db.execute('SELECT id FROM photos WHERE house_id=? ORDER BY position,id', (row['id'],)).fetchall()):
                filename = photo['id'] + '.jpg'
                (app.DATA / 'uploads' / filename).write_bytes((app.ROOT / 'demo' / f'land-{position%2+1}.jpg').read_bytes())
                db.execute('UPDATE photos SET filename=? WHERE id=?', (filename, photo['id']))
        count += 1
print(f'Updated {count} demo assets. Database backup: {backup}')
