"""Native SoftMatcha/immutable vault index adapter. No web framework dependency."""

from __future__ import annotations
import bisect, json, threading, time
from pathlib import Path
from collections import OrderedDict
from search_domain import SearchError, SearchQuery, EngineStatus
from infrastructure.vault_repository import VaultIndexRepository


class Engine:
    def __init__(
        self,
        vault: Path,
        state: Path,
        backend="fasttext",
        model="fasttext-ja-vectors",
        shards=8,
        excludes=(),
    ):
        self.repository = VaultIndexRepository(
            vault, state, backend, model, shards, excludes
        )
        self.backend = backend
        self.model = model
        self.lock = threading.Lock()
        self.models = None
        self.cache = OrderedDict()
        self.normalized = {}
        self.documents = {}
        self.cache_capacity = 8
        self.warmed_generation = None
        self.warming = False

    @property
    def snapshot(self):
        return self.repository.snapshot

    @property
    def error(self):
        return self.repository.error

    @error.setter
    def error(self, value):
        self.repository.error = value

    @property
    def building(self):
        return self.repository.building

    @property
    def updated(self):
        return self.repository.updated

    def files(self):
        return self.repository.files()

    def refresh(self):
        self.repository.refresh()

    def status(self):
        generation = tuple(self.snapshot)
        return EngineStatus(
            bool(generation),
            self.building,
            self.error,
            self.updated,
            bool(generation) and self.warmed_generation == generation,
            self.warming,
        )

    def record_error(self, detail):
        self.error = detail

    def load_models(self):
        if self.models is not None:
            return
        if self.backend == "compact-ja":
            from model_adapter import register_models

            register_models()
        from softmatcha.embeddings import get_embedding
        from softmatcha.tokenizers import get_tokenizer

        ec = get_embedding(self.backend)
        tc = get_tokenizer(self.backend)
        self.models = (
            ec.build(ec.Config(self.model, mmap=True)),
            tc.build(tc.Config(self.model)),
        )

    def load_shard(self, folder):
        import numpy as np

        key = str(folder)
        if key not in self.cache:
            from resident import resident_searcher

            embedding, tokenizer = self.models
            self.cache[key] = resident_searcher(
                folder, tokenizer, embedding, self.normalized
            )
            if len(self.cache) > self.cache_capacity:
                evicted, _ = self.cache.popitem(last=False)
                self.documents.pop(evicted, None)
        self.cache.move_to_end(key)
        if key not in self.documents:
            spans = json.loads((folder / "ready.json").read_text())
            starts = [s["start"] for s in spans]
            raw = (folder / "corpus.txt").read_bytes()
            newlines = np.flatnonzero(np.frombuffer(raw, dtype=np.uint8) == 10)
            self.documents[key] = (spans, starts, raw, newlines)
        return self.cache[key]

    def warmup(self):
        if not self.snapshot or not self.lock.acquire(blocking=False):
            return False
        try:
            generation = tuple(self.snapshot)
            if self.warmed_generation == generation:
                return True
            self.warming = True
            self.load_models()
            for folder in generation:
                self.load_shard(folder)
            self.warmed_generation = generation
            return True
        finally:
            self.warming = False
            self.lock.release()

    def search(self, q: SearchQuery):
        if not self.snapshot:
            if self.error:
                raise SearchError(
                    "not_ready",
                    "索引作成に失敗しました。サービスのログを確認してください。",
                )
            if self.building:
                raise SearchError(
                    "not_ready",
                    "初回索引を作成しています。少し待って検索してください。",
                )
            return {"results": [], "message": "対象Markdownノートがありません。"}
        if not self.lock.acquire(blocking=False):
            raise SearchError(
                "busy", "別の検索を処理中です。少し待って再検索してください。"
            )
        try:
            import numpy as np
            import unicodedata

            needle = unicodedata.normalize("NFKC", q.query).casefold()
            title_hits = {}
            for folder in self.snapshot:
                for entry in json.loads((folder / "ready.json").read_text()):
                    title = unicodedata.normalize(
                        "NFKC", Path(entry["path"]).stem
                    ).casefold()
                    if needle in title:
                        title_hits[(entry["path"], 0)] = {
                            "path": entry["path"],
                            "line": 0,
                            "excerpt": "ファイル名の一致",
                            "score": 1.01,
                        }
            self.load_models()
            from softmatcha.search import Searcher
            from softmatcha.struct import Pattern
            from softmatcha_rs import get_match_range_rs

            embedding, tokenizer = self.models
            tokens = tokenizer(q.query)
            if len(tokens) == 0:
                return {"results": []}
            if len(tokens) > 12:
                raise SearchError(
                    "invalid_query",
                    "SoftMatcha 2の検索語は分かち書き後12トークン以内にしてください。",
                )
            if any(int(t) == tokenizer.unk_idx for t in tokens):
                if title_hits:
                    return {
                        "results": list(title_hits.values())[: q.limit],
                        "message": "ファイル名の一致 · 本文検索にはモデル未登録語が含まれています",
                    }
                raise SearchError(
                    "invalid_query",
                    "モデルの語彙にない語があります。別の表現で検索してください。",
                )
            pattern = Pattern.build(
                tokens, Searcher.normalize(embedding(tokens)), [0.0] * len(tokens)
            )
            hits = title_hits
            generation = list(self.snapshot)
            deadline = time.monotonic() + 8
            for folder in generation:
                if time.monotonic() >= deadline:
                    break
                key = str(folder)
                searcher = self.load_shard(folder)
                matched, scores, counts, threshold = searcher.search(
                    pattern,
                    20,
                    q.min_similarity,
                    max(0.05, (deadline - time.monotonic()) / len(generation)),
                )
                spans, starts, raw, newlines = self.documents[key]
                with (folder / "corpus.txt").open("rb") as corpus:
                    for candidate, score in zip(matched, scores):
                        ids = [int(t) for t in candidate if int(t) < 1_000_000_000]
                        if not ids:
                            continue
                        l, r = get_match_range_rs(
                            np.asarray(ids, dtype=np.uint64),
                            searcher.rough,
                            searcher.idx_fname,
                            searcher.rough_div,
                            searcher.num_tokens,
                            searcher.idx_length,
                        )
                        for position in searcher.get_match_position(l, r, q.limit):
                            start = int(searcher.get_bytes_in_token(int(position)))
                            end = int(
                                searcher.get_bytes_in_token(
                                    int(position) + len(ids) - 1
                                )
                            ) + len(tokenizer.tokens[ids[-1]].encode())
                            idx = bisect.bisect_right(starts, start) - 1
                            if idx < 0 or end > spans[idx]["end"]:
                                continue
                            span = spans[idx]
                            line = int(
                                np.searchsorted(newlines, start)
                                - np.searchsorted(newlines, span["start"])
                            )
                            excerpt_start = max(span["start"], start - 100)
                            before = raw[excerpt_start:start].decode(
                                "utf-8", errors="ignore"
                            )
                            matched_text = raw[start:end].decode(
                                "utf-8", errors="ignore"
                            )
                            after = raw[end : min(span["end"], end + 150)].decode(
                                "utf-8", errors="ignore"
                            )
                            excerpt = before + matched_text + after
                            # Browser string offsets use UTF-16 code units, not UTF-8 bytes.
                            match_start = len(before.encode("utf-16-le")) // 2
                            match_end = (
                                match_start + len(matched_text.encode("utf-16-le")) // 2
                            )
                            hit = {
                                "path": span["path"],
                                "line": line,
                                "excerpt": excerpt,
                                "score": float(score),
                                "match_ranges": [[match_start, match_end]],
                            }
                            hitkey = (span["path"], line)
                            if hitkey not in hits or score > hits[hitkey]["score"]:
                                hits[hitkey] = hit
            results = sorted(
                hits.values(), key=lambda h: (-h["score"], h["path"], h["line"])
            )[: q.limit]
            return {
                "results": results,
                "indexed_at": self.updated,
                "message": f"{len(results)}件 · SoftMatcha 2"
                + (" · 索引更新中" if self.building else "")
                + " · 候補数と実行時間に上限があります",
            }
        finally:
            self.lock.release()
