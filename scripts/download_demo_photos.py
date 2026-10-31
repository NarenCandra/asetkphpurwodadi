"""Optional sample photos. No application dependency; bundled SVGs work offline."""
from pathlib import Path
from urllib.request import Request, urlopen
import argparse
import json
import shutil
import sys
from datetime import datetime

root = Path(__file__).resolve().parents[1]
photos = [
    'https://res.cloudinary.com/indonesiadesign/image/upload/f_jpg,w_1600/jav1.jpg',
    'https://a0.muscache.com/im/pictures/9eb83831-4ca8-4531-8e0b-1f4d93ff618a.jpg?im_w=1440',
    'https://events.rumah123.com/wp-content/uploads/sites/38/2025/08/25140725/desain-rumah-belanda-tiang-klasik.jpg',
]
parser = argparse.ArgumentParser()
parser.add_argument('--apply-demo', action='store_true', help='Replace photos of existing demo houses, retaining IDs and backing up old files.')
args = parser.parse_args()
backup = root / 'test-results' / ('photos-before-classic-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
for index, url in enumerate(photos, 1):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 SewarumaLocalDemo/1.0'}), timeout=20) as response:
        data = response.read(8000000)
    if not data.startswith(b'\xff\xd8\xff'):
        raise SystemExit('Downloaded file is not JPEG.')
    target = root / 'demo' / f'house-{index}.jpg'
    if target.exists():
        backup.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, backup / target.name)
    target.write_bytes(data)
    print(f'Downloaded demo photo {index}: {len(data)} bytes')

if args.apply_demo:
    sys.path.insert(0, str(root))
    import app
    with app.connect() as db:
        houses = [h for h in db.execute('SELECT * FROM houses ORDER BY rowid') if json.loads(h['body']).get('demo')]
        count = 0
        for index, house in enumerate(houses):
            entries = db.execute('SELECT * FROM photos WHERE house_id=? ORDER BY position,id', (house['id'],)).fetchall()
            for position, entry in enumerate(entries):
                source = root / 'demo' / f'house-{(index+position)%3+1}.jpg'
                old = app.DATA / 'uploads' / entry['filename']
                if old.exists():
                    backup.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(old, backup / entry['filename'])
                filename = entry['id'] + '.jpg'
                shutil.copy2(source, app.DATA / 'uploads' / filename)
                db.execute('UPDATE photos SET filename=? WHERE id=?', (filename, entry['id']))
                count += 1
    print(f'Updated {count} photos across {len(houses)} demo houses. Previous photos are backed up.')
