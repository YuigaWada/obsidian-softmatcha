"""Read-only vault repository and immutable content-addressed index publication."""

from pathlib import Path
import hashlib, json, subprocess, sys, time, threading


class VaultIndexRepository:
    def __init__(self, vault, state, backend, model, shards, excludes):
        self.vault = vault.resolve()
        self.state = state.resolve()
        if not self.vault.is_dir():
            raise ValueError("Vault directory does not exist")
        if self.state == self.vault:
            raise ValueError("Index directory must not be the vault root")
        if not 1 <= shards <= 128:
            raise ValueError("Invalid shard count")
        self.backend = backend
        self.model = model
        self.shards = shards
        self.excludes = tuple(excludes)
        self.snapshot = []
        self.error = None
        self.building = False
        self.updated = None
        self.refresh_lock = threading.Lock()
        self.state.mkdir(parents=True, exist_ok=True)

    def files(self):
        result = []
        for p in self.vault.rglob("*.md"):
            rel = p.relative_to(self.vault)
            if any(part.startswith(".") for part in rel.parts) or p.is_symlink():
                continue
            if self.vault not in p.resolve().parents or p.is_relative_to(self.state):
                continue
            if any(
                rel.as_posix().startswith(x.strip("/") + "/")
                or rel.as_posix() == x.strip("/")
                for x in self.excludes
            ):
                continue
            result.append(p)
        return sorted(result)

    def refresh(self):
        if not self.refresh_lock.acquire(blocking=False):
            return
        self.building = True
        try:
            if self.backend == "compact-ja":
                from model_adapter import prepare

                prepare(Path(self.model))
            buckets = [[] for _ in range(self.shards)]
            for p in self.files():
                path = p.relative_to(self.vault).as_posix()
                buckets[
                    int(hashlib.sha256(path.encode()).hexdigest(), 16) % self.shards
                ].append((path, p))
            snapshot = []
            for bucket in buckets:
                if not bucket:
                    continue
                bucket = [(path, p.read_bytes()) for path, p in bucket]
                for _, raw in bucket:
                    raw.decode("utf-8")
                digest = hashlib.sha256((self.backend + "\0" + self.model).encode())
                for path, raw in bucket:
                    digest.update(json.dumps([path, len(raw)]).encode())
                    digest.update(raw)
                folder = self.state / digest.hexdigest()
                folder.mkdir(exist_ok=True)
                if not (folder / "ready.json").exists():
                    spans = []
                    pos = 0
                    with (folder / "corpus.txt").open("wb") as f:
                        for path, raw in bucket:
                            f.write(raw + b"\n\n")
                            spans.append(
                                {"path": path, "start": pos, "end": pos + len(raw)}
                            )
                            pos += len(raw) + 2
                    subprocess.run(
                        [
                            sys.executable,
                            str(Path(__file__).resolve().parents[1] / "index_entry.py"),
                            "--index",
                            str(folder / "index"),
                            "--backend",
                            self.backend,
                            "--model",
                            self.model,
                            "--mem_size",
                            "128",
                            "--mem_size_ex",
                            "32",
                            "--max_vocab",
                            "65536",
                            str(folder / "corpus.txt"),
                        ],
                        check=True,
                        timeout=3600,
                    )
                    (folder / "ready.json").write_text(
                        json.dumps(spans, ensure_ascii=False)
                    )
                snapshot.append(folder)
            # A query takes a reference to a complete generation. Never mutate its files.
            self.snapshot = snapshot
            self.updated = time.time()
            self.error = None
        except Exception as e:
            self.error = str(e)
        finally:
            self.building = False
            self.refresh_lock.release()
