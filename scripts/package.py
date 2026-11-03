"""Package an explicit public allowlist. Never package settings, notes or indices."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
target = root / 'dist' / 'softmatcha-for-obsidian.zip'
target.parent.mkdir(exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for name in ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'README.md', 'ARCHITECTURE.md']:
        archive.write(root/name, name)
    for file in sorted((root/'assets').rglob('*')):
        if file.is_file(): archive.write(file, file.relative_to(root))
print(target)
