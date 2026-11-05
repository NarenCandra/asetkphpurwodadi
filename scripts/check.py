"""Dependency-free build/lint checks for this buildless application."""
import ast
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
for file in [root / 'app.py', root / 'seed.py', *root.glob('tests/*.py'), *root.glob('scripts/*.py')]:
    ast.parse(file.read_text(encoding='utf-8'), filename=str(file))
    for number, line in enumerate(file.read_text(encoding='utf-8').splitlines(), 1):
        if line.rstrip() != line:
            raise SystemExit(f'{file}:{number}: trailing whitespace')
json.loads((root / 'demo/houses.json').read_text(encoding='utf-8'))
for file in [*root.glob('public/assets/*.js'), *root.glob('scripts/*.cjs'), *root.glob('scripts/*.mjs'), *root.glob('server/*.mjs'), *root.glob('netlify/functions/*.mjs')]:
    subprocess.run(['node', '--check', str(file)], check=True)
print('PASS: Python syntax, whitespace, JSON, JavaScript syntax. Buildless: no compilation required.')
