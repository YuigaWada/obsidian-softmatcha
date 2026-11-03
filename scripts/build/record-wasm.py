"""Record source/artifact digests without embedding local filesystem paths."""
from pathlib import Path
import hashlib,json,subprocess
root=Path(__file__).resolve().parents[2]
paths=[root/'Cargo.toml',root/'Cargo.lock',*sorted((root/'crates/core').rglob('*.rs')),*sorted((root/'crates/wasm').rglob('*.rs')),root/'crates/core/Cargo.toml',root/'crates/wasm/Cargo.toml']
sha=hashlib.sha256()
for path in sorted(paths):sha.update(path.relative_to(root).as_posix().encode()+b'\0'+path.read_bytes())
wasm=(root/'resources/wasm/softmatcha_wasm_bg.wasm').read_bytes()
if b'/Users/' in wasm or str(root).encode() in wasm:raise SystemExit('Local filesystem paths remain in WASM')
(root/'resources/wasm/BUILD.json').write_text(json.dumps({'sourceSha256':sha.hexdigest(),'artifactSha256':hashlib.sha256(wasm).hexdigest(),'compiler':subprocess.check_output(['rustc','--version'],text=True).strip(),'wasmPack':subprocess.check_output(['wasm-pack','--version'],text=True).strip(),'upstream':'b37e104741465a31425db5f07202d8065af7d571'},indent=2)+'\n')
print('Recorded portable WASM build digests.')
