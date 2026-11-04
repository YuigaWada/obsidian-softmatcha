"""Create standard plugin assets and separately importable, data-only model packs."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse,hashlib,json,shutil
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--models',action='store_true');args=parser.parse_args()
version=json.loads((root/'manifest.json').read_text())['version'];out=root/'dist';out.mkdir(exist_ok=True)
def archive_file(archive,name,raw):
    info=ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;info.external_attr=0o644<<16
    archive.writestr(info,raw,compresslevel=9)
shutil.copy2(root/'manifest.json',out/'manifest.json')
shutil.copy2(root/'src/presentation/styles.css',out/'styles.css')
zip_path=out/'softmatcha-for-obsidian.zip'
with ZipFile(zip_path,'w') as archive:
    for name in ['main.js','manifest.json','styles.css','LICENSE','README.md']:
        archive_file(archive,name,((out if name in ('main.js','styles.css') else root)/name).read_bytes())
    archive_file(archive,'docs/OMNISEARCH-LICENSE.txt',(root/'docs/OMNISEARCH-LICENSE.txt').read_bytes())
    for file in sorted((root/'licenses').glob('*')):
        if file.is_file():archive_file(archive,'licenses/'+file.name,file.read_bytes())
if args.models:
    catalog=json.loads((root/'resources/model-catalog.json').read_text())
    for language in ['ja','en']:
        with ZipFile(out/f'models-{language}-{version}.zip','w') as archive:
            archive_file(archive,'pack.json',json.dumps({'schema':1,'languages':[language]}).encode())
            for name,entry in catalog['files'].items():
                if entry['language'] not in (language,'shared'):continue
                raw=(root/'.local/assets'/name).read_bytes()
                if len(raw)!=entry['size'] or hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise SystemExit('Asset catalog does not match '+name)
                archive_file(archive,name,raw)
# List only artifacts produced for this release, never stale files in dist.
outputs=['main.js','manifest.json','styles.css',zip_path.name]
if args.models:outputs += [f'models-{language}-{version}.zip' for language in ['ja','en']]
(out/'SHA256SUMS').write_text(''.join(hashlib.sha256((out/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in outputs))
print('Prepared '+', '.join(outputs)+' and SHA256SUMS')
