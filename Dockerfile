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

ENV AI_BASE_URL=https://api.groq.com/openai/v1
ENV AI_MODEL=llama-3.3-70b-versatile
ENV AI_API_KEY=

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
