"""Inbound FastAPI adapter: auth, request validation and wire serialization."""

import threading
from dataclasses import asdict
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel, Field
from search_domain import SearchQuery, SearchError
from search_application import SearchService


class Query(BaseModel):
    corpus: str = "default"
    query: str = Field(min_length=1, max_length=512)
    limit: int = Field(default=50, ge=1, le=100)
    min_similarity: float = Field(default=0.45, ge=0.1, le=1)


def create_app(engine, token, corpus="default"):
    if len(token) < 24:
        raise ValueError("SOFTMATCHA_TOKEN must contain at least 24 characters")
    service = SearchService(engine, corpus)
    stop = threading.Event()

    def watcher():
        while not stop.is_set():
            service.refresh_and_prepare()
            stop.wait(60)

    @asynccontextmanager
    async def lifespan(app):
        worker = threading.Thread(target=watcher, daemon=True)
        worker.start()
        yield
        stop.set()

    app = FastAPI(lifespan=lifespan)
    from fastapi.responses import JSONResponse

    @app.exception_handler(SearchError)
    async def search_error(request, error):
        return JSONResponse(
            status_code={
                "invalid_query": 422,
                "not_ready": 503,
                "busy": 429,
                "not_found": 404,
            }[error.kind],
            content={"detail": error.detail},
        )

    def authorize(value):
        import secrets

        if not secrets.compare_digest(value or "", f"Bearer {token}"):
            raise HTTPException(401, "Unauthorized")

    @app.get("/v1/status")
    def status(authorization: str | None = Header(default=None)):
        authorize(authorization)
        return asdict(service.status())

    @app.post("/v1/warmup")
    def warmup(
        body: dict,
        tasks: BackgroundTasks,
        authorization: str | None = Header(default=None),
    ):
        authorize(authorization)
        service.authorize_corpus(body.get("corpus", "default"))
        # Do not block the client while loading models and immutable index pages.
        tasks.add_task(service.prepare, body.get("corpus", "default"))
        status = service.status()
        return {"warmed": status.warmed, "warming": status.warming or status.building}

    @app.post("/v1/search")
    def search(q: Query, authorization: str | None = Header(default=None)):
        authorize(authorization)
        return service.search(SearchQuery(**q.model_dump()))

    return app
