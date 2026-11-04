"""Search application boundary. Native and portable engines implement this port."""

from typing import Protocol, Any
from search_domain import SearchQuery, SearchError, EngineStatus


class SearchEngine(Protocol):
    def search(self, query: SearchQuery) -> dict[str, Any]: ...
    def warmup(self) -> bool: ...
    def refresh(self) -> None: ...
    def status(self) -> EngineStatus: ...
    def record_error(self, detail: str) -> None: ...


class SearchService:
    def __init__(self, engine: SearchEngine, corpus: str = "default"):
        self.engine = engine
        self.corpus = corpus

    def authorize_corpus(self, corpus: str):
        if corpus != self.corpus:
            raise SearchError("not_found", "Unknown corpus")

    def search(self, query: SearchQuery):
        self.authorize_corpus(query.corpus)
        return self.engine.search(query)

    def prepare(self, corpus: str):
        self.authorize_corpus(corpus)
        return self.engine.warmup()

    def refresh_and_prepare(self):
        self.engine.refresh()
        try:
            self.engine.warmup()
        except Exception as error:
            self.engine.record_error(str(error))

    def status(self) -> EngineStatus:
        return self.engine.status()
