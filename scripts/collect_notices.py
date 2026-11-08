"""Assemble licenses actually available from the installed direct dependencies."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
paths=[ROOT/'.deps/json/LICENSE.MIT',ROOT/'.deps/json-schema-validator/LICENSE']
paths+=sorted((ROOT/'.deps/ortools/share').rglob('*LICENSE*'))
paths+=sorted((ROOT/'.deps/ortools/share').rglob('License*'))
for name in ['react','react-dom','scheduler']:
 paths.append(ROOT/f'playground/node_modules/{name}/LICENSE')
parts=['Third-party license texts supplied with the development dependencies.\nSee THIRD_PARTY_NOTICES.md for version and usage information.\n']
for p in paths:
 if p.is_file():parts.append('\n'+'='*72+'\n'+str(p.relative_to(ROOT))+'\n'+'='*72+'\n'+p.read_text(errors='replace'))
(ROOT/'docs/THIRD_PARTY_LICENSES.txt').write_text('\n'.join(line.rstrip() for line in '\n'.join(parts).splitlines())+'\n')
