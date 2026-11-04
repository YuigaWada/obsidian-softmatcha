FROM rust:1.90-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-dev python3-venv pkg-config libicu-dev git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" VIRTUAL_ENV=/app/.venv
RUN git clone https://github.com/softmatcha/softmatcha2.git /app/vendor && git -C /app/vendor checkout b37e104741465a31425db5f07202d8065af7d571
COPY compat.patch /app/compat.patch
RUN git -C /app/vendor apply /app/compat.patch
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir /app/vendor maturin -r requirements.txt && maturin develop --release --manifest-path /app/vendor/rust/Cargo.toml
COPY service.py http_api.py search_domain.py search_application.py model_adapter.py index_entry.py resident.py /app/
COPY infrastructure/ /app/infrastructure/
EXPOSE 8769
ENTRYPOINT ["python", "service.py", "--host", "0.0.0.0", "--vault", "/vault", "--state", "/state"]
