import importlib.util
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

spec = importlib.util.spec_from_file_location(
    "service", Path(__file__).parents[2] / "dev/native-reference/service.py"
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
TOKEN = "test-token-for-local-tests-only"


class Fake:
    snapshot = []
    building = False
    error = None
    updated = None
    warming = False
    warmed_generation = None

    def status(self):
        from search_domain import EngineStatus

        return EngineStatus(False, False, None, None, False, False)

    def record_error(self, detail):
        self.error = detail

    def refresh(self):
        pass

    def warmup(self):
        return True

    def search(self, q):
        return {
            "results": [
                {
                    "path": "研究/日本語.md",
                    "line": 2,
                    "excerpt": "根拠の原文",
                    "score": 0.9,
                }
            ]
        }


def test_auth_scope_and_validation():
    with TestClient(m.create_app(Fake(), TOKEN)) as c:
        assert c.post("/v1/search", json={"query": "test"}).status_code == 401
        h = {"Authorization": "Bearer " + TOKEN}
        assert (
            c.post(
                "/v1/search", json={"query": "test", "corpus": "other"}, headers=h
            ).status_code
            == 404
        )
        assert (
            c.post(
                "/v1/search", json={"query": "test", "limit": 10000}, headers=h
            ).status_code
            == 422
        )
        assert (
            c.post("/v1/search", json={"query": "日本語"}, headers=h).json()["results"][
                0
            ]["path"]
            == "研究/日本語.md"
        )


def test_scope(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "one.md").write_text("日本語")
    (vault / ".obsidian").mkdir()
    (vault / ".obsidian" / "secret.md").write_text("hidden")
    (vault / "excluded").mkdir()
    (vault / "excluded" / "two.md").write_text("ignored")
    (vault / "link.md").symlink_to(vault / "one.md")
    e = m.Engine(vault, tmp_path / "state", excludes=["excluded"])
    assert [p.name for p in e.files()] == ["one.md"]


def test_failed_generation_keeps_previous(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "one.md").write_text("original")
    e = m.Engine(vault, tmp_path / "state", shards=1)

    def build(args, **kwargs):
        idx = Path(args[args.index("--index") + 1])
        idx.mkdir()
        (idx / "marker").write_text("ready")

    monkeypatch.setattr(
        __import__(
            "infrastructure.vault_repository", fromlist=["subprocess"]
        ).subprocess,
        "run",
        build,
    )
    e.refresh()
    previous = e.snapshot.copy()
    assert len(previous) == 1
    (vault / "one.md").write_text("changed")

    def fail(*a, **k):
        raise RuntimeError("build failure")

    monkeypatch.setattr(
        __import__(
            "infrastructure.vault_repository", fromlist=["subprocess"]
        ).subprocess,
        "run",
        fail,
    )
    e.refresh()
    assert e.snapshot == previous and e.error == "build failure"


def test_warmup_requires_auth_and_correct_corpus():
    with TestClient(m.create_app(Fake(), TOKEN)) as c:
        assert c.post("/v1/warmup", json={}).status_code == 401
        h = {"Authorization": "Bearer " + TOKEN}
        assert (
            c.post("/v1/warmup", json={"corpus": "other"}, headers=h).status_code == 404
        )
        assert (
            c.post("/v1/warmup", json={"corpus": "default"}, headers=h).status_code
            == 200
        )
