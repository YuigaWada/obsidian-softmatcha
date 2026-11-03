"""Prepare public vectors for release; no vault access or native server required."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'server'))
from model_adapter import prepare
for language in ['ja','en']:prepare(root/'server/state/models'/f'compact-{language}',language=language)
