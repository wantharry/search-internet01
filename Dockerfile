# ── Node build stage ──────────────────────────────────────────
FROM node:20-slim AS node-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Python deps stage ─────────────────────────────────────────
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

# Copy React build output as static/
COPY --from=node-builder /app/frontend/dist/ static/

ENV AI_BASE_URL=https://api.groq.com/openai/v1
ENV AI_MODEL=llama-3.3-70b-versatile
ENV AI_API_KEY=
ENV OLLAMA_BASE_URL=http://100.84.196.88:11434/v1

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
