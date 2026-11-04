"""Run optional native tests with explicit repository and cache locations."""
from pathlib import Path
import sys
import pytest

root = Path(__file__).resolve().parents[2]
raise SystemExit(pytest.main([
    "-c", str(root / "config/python/pyproject.toml"),
    "--rootdir", str(root),
    "-o", f"cache_dir={root / '.local/cache/pytest'}",
    str(root / "tests/native"), *sys.argv[1:],
]))
