"""Composition root and backwards-compatible public imports."""

import os, sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from infrastructure.native_engine import Engine
from http_api import Query, create_app

if __name__ == "__main__":
    import argparse, uvicorn

    p = argparse.ArgumentParser()
    p.add_argument("--vault", type=Path, required=True)
    p.add_argument("--state", type=Path, default=Path("state"))
    p.add_argument("--backend", default="compact-ja")
    p.add_argument("--model", default=None)
    p.add_argument("--shards", type=int, default=8)
    p.add_argument("--exclude", action="append", default=[])
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8769)
    p.add_argument("--corpus", default="default")
    p.add_argument("--token-file", type=Path)
    args = p.parse_args()
    if not 1 <= args.shards <= 128:
        p.error("--shards must be between 1 and 128")
    model = (
        args.model or str(args.state.resolve() / "models" / "compact-ja")
        if args.backend == "compact-ja"
        else args.model or "fasttext-ja-vectors"
    )
    engine = Engine(
        args.vault, args.state, args.backend, model, args.shards, args.exclude
    )
    token = os.environ.get("SOFTMATCHA_TOKEN", "")
    if args.token_file:
        token_data = args.token_file.read_text().strip()
        token = (
            json.loads(token_data)["token"]
            if token_data.startswith("{")
            else token_data
        )
    uvicorn.run(create_app(engine, token, args.corpus), host=args.host, port=args.port)
