"""Export public Japanese/English models and dictionary assets; never notes."""
from pathlib import Path
import hashlib, json, shutil
import numpy as np
root=Path(__file__).resolve().parents[2]
target=root/'.local/assets';target.mkdir(exist_ok=True)
(target/'dict').mkdir(exist_ok=True);(target/'LICENSES').mkdir(exist_ok=True)
files=sorted((root/'node_modules/kuromoji/dict').glob('*.gz'))
for file in files:shutil.copy2(file,target/'dict'/file.name)
models={}
for language in ['ja','en']:
    source=root/'.local/models'/f'compact-{language}'
    destination=target if language=='ja' else target/language
    destination.mkdir(exist_ok=True)
    vectors=np.load(source/'embedding.npy').astype('<f4');vectors.tofile(destination/'vectors.f32')
    shutil.copy2(source/'vocab.json',destination/'vocab.json')
    sha=hashlib.sha256()
    for file in [destination/'vectors.f32',destination/'vocab.json',*([target/'dict'/f.name for f in files] if language=='ja' else [])]:sha.update(file.read_bytes())
    models[language]={'path':'' if language=='ja' else language,'version':('portable-index-v2:' if language=='ja' else 'english-index-v1:')+sha.hexdigest(),'dimensions':vectors.shape[1],'words':vectors.shape[0]}
    if (source/'SOURCE.txt').exists():shutil.copy2(source/'SOURCE.txt',target/'LICENSES'/f'MODEL-{language}-SOURCE.txt')
metadata={**models['ja'],'models':models,'dictionaries':[f.name.removesuffix('.dat.gz') for f in files]}
(target/'manifest.json').write_text(json.dumps(metadata))
for file in ['LICENSE-2.0.txt','NOTICE.md']:shutil.copy2(root/'node_modules/kuromoji'/file,target/'LICENSES'/file)
for source,name in [('src/rust/core/LICENSE','SOFTMATCHA-APACHE-2.0.txt'),('src/rust/core/NOTICE','SOFTMATCHA-NOTICE.txt'),('LICENSE','PLUGIN-MIT.txt')]:shutil.copy2(root/source,target/'LICENSES'/name)
print('Exported Japanese/English models and dictionary assets.')

shutil.copy2(root/'licenses/fastText-CC-BY-SA-3.0.txt',target/'LICENSES'/'fastText-CC-BY-SA-3.0.txt')
shutil.copy2(root/'licenses/THIRD_PARTY_NOTICES.md',target/'LICENSES'/'THIRD_PARTY_NOTICES.md')

# Explicit allowlist keeps historical/generated leftovers out of model releases.
metadata['files']=['vectors.f32','vocab.json','en/vectors.f32','en/vocab.json',*[f'dict/{f.name}' for f in files],*[f'LICENSES/{name}' for name in ['LICENSE-2.0.txt','NOTICE.md','MODEL-ja-SOURCE.txt','MODEL-en-SOURCE.txt','SOFTMATCHA-APACHE-2.0.txt','SOFTMATCHA-NOTICE.txt','PLUGIN-MIT.txt','fastText-CC-BY-SA-3.0.txt','THIRD_PARTY_NOTICES.md']]]
(target/'manifest.json').write_text(json.dumps(metadata))
