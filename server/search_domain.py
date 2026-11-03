"""Search values and errors. No HTTP, filesystem, or model dependencies."""

from dataclasses import dataclass


class SearchError(Exception):
    def __init__(self, kind: str, detail: str):
        super().__init__(detail)
        self.kind = kind
        self.detail = detail


@dataclass(frozen=True)
class SearchQuery:
    query: str
    corpus: str = "default"
    limit: int = 50
    min_similarity: float = 0.45

    def __post_init__(self):
        if not self.query.strip() or len(self.query) > 512:
            raise SearchError("invalid_query", "検索語は1〜512文字で指定してください。")
        if not 1 <= self.limit <= 100 or not 0.1 <= self.min_similarity <= 1:
            raise SearchError("invalid_query", "Invalid search bounds")


@dataclass(frozen=True)
class EngineStatus:
    ready: bool
    building: bool
    error: str | None
    indexed_at: float | None
    warmed: bool
    warming: bool
