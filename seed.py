"""Explicit, separate demo data. Never creates an admin account."""
import json
import secrets
from datetime import timedelta

import app


def seed_demo():
    app.init_db()
    with app.connect() as db:
        if db.execute('SELECT COUNT(*) FROM houses').fetchone()[0]:
            raise SystemExit('Database tidak kosong. Seed dibatalkan agar data Anda tidak tertimpa.')
        records = json.loads((app.ROOT / 'demo' / 'houses.json').read_text(encoding='utf-8'))
        for index, house in enumerate(records):
            identifier = secrets.token_hex(12)
            house['demo'] = True
            house['internal_notes'] = 'DATA CONTOH. Bukan rumah atau transaksi sebenarnya.'
            if house['status'] == 'Tersewa':
                house['lease_period'] = 'monthly' if index % 2 else 'yearly'
                house['lease_start'] = (app.today() - timedelta(days=300)).isoformat()
                house['lease_end'] = (app.today() + timedelta(days=5 if index % 2 else -2)).isoformat()
            db.execute('INSERT INTO houses(id,code,body) VALUES(?,?,?)', (identifier, house['code'], json.dumps(house)))
            # Bundled original SVG illustrations are always available offline.
            # Real sample photographs, if downloaded separately, take precedence.
            for position in range(2):
                asset_index = (index + position) % 3 + 1
                source = app.ROOT / 'demo' / f'house-{asset_index}.jpg'
                if house.get('asset_type') == 'land':
                    source = app.ROOT / 'demo' / f'land-{position+1}.jpg'
                if not source.exists():
                    source = app.ROOT / 'demo' / f'house-{asset_index}.svg'
                photo_id = secrets.token_hex(16)
                filename = photo_id + source.suffix
                (app.DATA / 'uploads' / filename).write_bytes(source.read_bytes())
                db.execute('INSERT INTO photos VALUES(?,?,?,?)', (photo_id, identifier, filename, position))
    print('7 rumah demonstrasi ditambahkan. Data bukan penawaran nyata. Akun admin tidak dibuat otomatis.')


if __name__ == '__main__':
    seed_demo()
