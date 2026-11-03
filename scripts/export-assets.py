"""Export public model/dictionary assets only. Never reads corpus or vault notes."""

from pathlib import Path
import hashlib, json, shutil
import numpy as np

root = Path(__file__).resolve().parents[1]
source = root / "server/state/models/compact-ja"
target = root / "assets"
target.mkdir(exist_ok=True)
vectors = np.load(source / "embedding.npy").astype("<f4")
vectors.tofile(target / "vectors.f32")
shutil.copy2(source / "vocab.json", target / "vocab.json")
(target / "dict").mkdir(exist_ok=True)
files = sorted((root / "node_modules/kuromoji/dict").glob("*.gz"))
for file in files:
    shutil.copy2(file, target / "dict" / file.name)
sha = hashlib.sha256()
for file in [
    target / "vectors.f32",
    target / "vocab.json",
    *[target / "dict" / f.name for f in files],
]:
    sha.update(file.read_bytes())
(target / "manifest.json").write_text(
    json.dumps(
        {
            "version": "portable-index-v2:" + sha.hexdigest(),
            "dimensions": vectors.shape[1],
            "words": vectors.shape[0],
            "dictionaries": [f.name.removesuffix(".dat.gz") for f in files],
        }
    )
)
(target / "LICENSES").mkdir(exist_ok=True)
for file in ["LICENSE-2.0.txt", "LICENSE.txt", "NOTICE.md"]:
    f = root / "node_modules/kuromoji" / file
    if f.exists():
        shutil.copy2(f, target / "LICENSES" / file)
if (source / "SOURCE.txt").exists():
    shutil.copy2(source / "SOURCE.txt", target / "LICENSES" / "MODEL-SOURCE.txt")
print(f"Exported {vectors.shape[0]} vectors, {len(files)} dictionaries to {target}")

shutil.copy2(root/'rust/LICENSE',target/'LICENSES'/'SOFTMATCHA-APACHE-2.0.txt')
shutil.copy2(root/'rust/NOTICE',target/'LICENSES'/'SOFTMATCHA-NOTICE.txt')
shutil.copy2(root/'LICENSE',target/'LICENSES'/'PLUGIN-MIT.txt')
