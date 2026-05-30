# Pulsewire ⚡

AI-powered news search and live feed reader. Search the web, get multi-depth AI summaries, follow live RSS feeds, and summarize individual articles — all from a single page.

**Docker Hub**: [`wantharry/pulsewire-news`](https://hub.docker.com/r/wantharry/pulsewire-news)  
**Platforms**: `linux/amd64`, `linux/arm64`

---

## Features

- **Search** — DuckDuckGo web search with AI summaries at three depths (TL;DR, Summary, Detailed)
- **Live feeds** — Real-time RSS/Atom news from configurable sources, auto-refreshing
- **Article summarizer** — One-click AI summary of any article
- **AI providers** — Switch between [Groq](https://console.groq.com) (cloud, free) and [Ollama](https://ollama.com) (local/self-hosted) at runtime
- **Voice search & TTS** — Mic input and read-aloud playback
- **Alerts & Saved** — Keyword alerts and bookmark articles locally

---

## Quick Start (Docker)

### Groq only (simplest)

```bash
docker run -d --name pulsewire \
  -p 5001:8000 \
  -e AI_API_KEY=your_groq_api_key \
  wantharry/pulsewire-news:latest
```

Open [http://localhost:5001](http://localhost:5001)

---

### Groq + Ollama (local Ollama on the same host)

```bash
docker run -d --name pulsewire \
  -p 5001:8000 \
  -e AI_API_KEY=your_groq_api_key \
  -e OLLAMA_BASE_URL=http://172.17.0.1:11434/v1 \
  wantharry/pulsewire-news:latest
```

> `172.17.0.1` is the Docker bridge gateway — how the container reaches the host.

---

### Groq + Ollama (Ollama on a remote server / Tailscale)

```bash
docker run -d --name pulsewire \
  --network host \
  -e AI_API_KEY=your_groq_api_key \
  -e OLLAMA_BASE_URL=http://<ollama-host-ip>:11434/v1 \
  wantharry/pulsewire-news:latest
```

> Use `--network host` when the Ollama host is on a VPN (e.g. Tailscale) so the container shares the host network.  
> With `--network host` the app binds to port **8000** on the host directly.

---

### Stop / restart

```bash
# Stop
docker stop pulsewire

# Remove (required before re-running with same name)
docker rm -f pulsewire

# Pull latest image before restarting
docker pull wantharry/pulsewire-news:latest
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AI_API_KEY` | *(required)* | Groq API key — get one free at [console.groq.com](https://console.groq.com) |
| `AI_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint for the primary provider |
| `AI_MODEL` | `llama-3.3-70b-versatile` | Default model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Ollama endpoint (used when Ollama provider is selected in UI) |

Copy `.env.example` to `.env` and fill in your values for local development.

---

## Docker Compose

```bash
cp .env.example .env
# Edit .env and set AI_API_KEY

docker compose up -d
```

App will be available at [http://localhost:8000](http://localhost:8000).

---

## Development (local, no Docker)

```bash
# 1. Clone
git clone git@github.com:wantharry/search-internet01.git
cd search-internet01

# 2. Create virtualenv
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure
cp .env.example .env
# Edit .env — set AI_API_KEY at minimum

# 5. Run
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open [http://localhost:8000](http://localhost:8000)

---

## Building the Docker Image

### Single platform (current machine)

```bash
docker build -t pulsewire-local:dev .
docker run -d --name pulsewire -p 5001:8000 \
  -e AI_API_KEY=your_key \
  pulsewire-local:dev
```

### Multi-platform (amd64 + arm64) and push to Docker Hub

```bash
# One-time: create a multi-platform builder
docker buildx create --name multibuilder --use

# Build and push
docker buildx build \
  --builder multibuilder \
  --platform linux/amd64,linux/arm64 \
  -t wantharry/pulsewire-news:latest \
  --push .
```

---

## AI Provider Notes

### Groq
- Free tier available at [console.groq.com](https://console.groq.com)
- Fastest option — cloud inference
- Set `AI_API_KEY` to your Groq key

### Ollama
- Self-hosted, runs models locally
- Install: [ollama.com](https://ollama.com)
- Pull models: `ollama pull llama3.2:1b` or `ollama pull gemma3:4b`
- The app auto-discovers available models from the Ollama API
- **Oracle Cloud / firewall note**: if Ollama is behind a firewall that drops idle connections (common with cloud providers), the app uses TCP keepalives to maintain the connection during slow model cold-starts

---

## Stack

- **Backend**: Python 3.12, FastAPI, uvicorn, httpx
- **Search**: DuckDuckGo (`ddgs`), BeautifulSoup4, feedparser
- **Frontend**: Vanilla JS, single-file SPA (`static/index.html`)
- **AI**: OpenAI-compatible streaming API (Groq or Ollama)
