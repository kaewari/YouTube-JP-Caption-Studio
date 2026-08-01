# Local caption bridge (tokenize / dict / scripts).
#   cd local-bridge && docker compose up --build
FROM python:3.10-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Layout matches script_store: ROOT = parent of this dir → /app, scripts at /app/scripts
WORKDIR /app/local-bridge

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r requirements.txt

COPY *.py ./

ENV PYTHONPATH=/app/local-bridge
ENV PYTHONUNBUFFERED=1

EXPOSE 8765

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8765/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1"]
