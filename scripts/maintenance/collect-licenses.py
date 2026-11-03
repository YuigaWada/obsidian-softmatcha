"""Copy distribution license texts, never registry paths or local metadata."""
from pathlib import Path
import json,shutil,subprocess
root=Path(__file__).resolve().parents[2];out=root/'licenses';out.mkdir(exist_ok=True)
for name in ['fflate','kuromoji','doublearray','async','lodash','zlibjs']:
    package=root/'node_modules'/name
    for file in package.iterdir():
        if file.is_file() and file.name.lower().startswith(('license','licence','copying','notice')):shutil.copy2(file,out/f'{name}-{file.name}')
metadata=json.loads(subprocess.check_output(['cargo','metadata','--manifest-path',str(root/'Cargo.toml'),'--format-version','1','--locked'],text=True))
rows=[]
for package in sorted(metadata['packages'],key=lambda p:p['name']):
    if package['name'].startswith('softmatcha-'):continue
    source=Path(package['manifest_path']).parent
    files=[f for f in source.iterdir() if f.is_file() and f.name.lower().startswith(('license','licence','copying','notice'))]
    for file in files:shutil.copy2(file,out/f"rust-{package['name']}-{package['version']}-{file.name}")
    rows.append({'name':package['name'],'version':package['version'],'license':package['license'],'texts':[f.name for f in files]})
(out/'rust-dependencies.json').write_text(json.dumps(rows,indent=2)+'\n')
shutil.copy2(root/'crates/core/LICENSE',out/'SoftMatcha2-Apache-2.0.txt')
shutil.copy2(root/'crates/core/NOTICE',out/'SoftMatcha2-NOTICE.txt')
shutil.copy2(root/'dev/native-reference/licenses/SoftMatcha1-MIT.txt',out/'SoftMatcha1-MIT.txt')
print(f'Copied license texts for {len(rows)} Rust crates and JavaScript dependencies.')
