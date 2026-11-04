"""Record public model asset hashes for data-only import validation."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[2];assets=root/'.local/assets'
metadata=json.loads((assets/'manifest.json').read_text())
files={}
for name in sorted(['manifest.json',*metadata['files']]):
    file=assets/name
    name=file.relative_to(assets).as_posix()
    if name=='manifest.json' or name.startswith('LICENSES/'):language='shared'
    elif name.startswith('en/'):language='en'
    else:language='ja'
    raw=file.read_bytes();files[name]={'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'language':language}
catalog={'schema':1,'models':metadata['models'],'files':files}
(root/'resources/model-catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
print('Recorded public asset digests; no corpus data included.')
