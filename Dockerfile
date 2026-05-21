# ── Build stage ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Runtime stage ─────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copy installed packages from build stage
COPY --from=builder /install /usr/local

# Copy app source
COPY main.py .
COPY static/ static/

# Ollama runs on the host; override via env var if needed
ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV OLLAMA_MODEL=qwen3:8b

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
