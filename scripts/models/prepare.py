"""Prepare public vectors for release; no vault access or native server required."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
from vectors import prepare
for language in ['ja','en']:prepare(root/'.local/models'/f'compact-{language}',language=language)
