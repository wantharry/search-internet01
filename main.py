import asyncio
import datetime
import json
import os
import re
import socket
import sqlite3
import threading
import time as _time_mod
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from ddgs import DDGS
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv(override=False)  # usecwd default finds .env relative to cwd

AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.groq.com/openai/v1")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
AI_API_KEY = os.environ.get("AI_API_KEY", "")
DEFAULT_MODEL = os.environ.get("AI_MODEL", "llama-3.1-8b-instant")
GROQ_FALLBACK_MODELS = [
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "llama3-8b-8192",
]


# ── Article DB ───────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "articles.db")
_db_lock = threading.Lock()


def _init_db() -> None:
    """Create SQLite tables and FTS5 index (idempotent)."""
    with sqlite3.connect(DB_PATH) as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS articles (
                url       TEXT PRIMARY KEY,
                title     TEXT NOT NULL DEFAULT '',
                snippet   TEXT DEFAULT '',
                source    TEXT DEFAULT '',
                topic     TEXT DEFAULT '',
                published REAL DEFAULT 0,
                fetched_at REAL DEFAULT 0
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
                title, snippet, source, topic,
                content=articles, content_rowid=rowid
            );
            CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
                INSERT INTO articles_fts(rowid,title,snippet,source,topic)
                VALUES (new.rowid,new.title,new.snippet,new.source,new.topic);
            END;
            CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
                INSERT INTO articles_fts(articles_fts,rowid,title,snippet,source,topic)
                VALUES ('delete',old.rowid,old.title,old.snippet,old.source,old.topic);
            END;
        """)
        con.commit()


def _store_articles(items: list[dict]) -> None:
    """Upsert articles into SQLite; prune records older than 30 days."""
    now = _time_mod.time()
    cutoff = now - 30 * 86400
    with _db_lock:
        with sqlite3.connect(DB_PATH) as con:
            for item in items:
                url = item.get("url", "")
                if not url:
                    continue
                con.execute(
                    "INSERT OR IGNORE INTO articles"
                    " (url,title,snippet,source,topic,published,fetched_at)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (
                        url,
                        item.get("title", "")[:500],
                        item.get("snippet", "")[:800],
                        item.get("source", "")[:200],
                        item.get("topic", "")[:100],
                        item.get("_pub_ts", 0) or 0,
                        now,
                    ),
                )
            con.execute("DELETE FROM articles WHERE fetched_at < ?", (cutoff,))
            con.commit()


async def _bg_feed_refresh() -> None:
    """Background: cycle through all feed categories, refresh one every 3 min."""
    import calendar, math as _math  # noqa: E401
    cats = [k for k in LIVE_FEEDS if k != "all"]
    idx = 0
    while True:
        await asyncio.sleep(180)
        cat = cats[idx % len(cats)]
        idx += 1
        try:
            now_ts = _time_mod.time()
            _lk = cat.split("-")[0] if "-" in cat else cat
            topic_label = _KEY_TOPIC_LABELS.get(_lk, "")
            items: list[dict] = []
            async with httpx.AsyncClient(
                timeout=10.0,
                headers={"User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)"},
                follow_redirects=True,
            ) as client:
                for url in LIVE_FEEDS.get(cat, []):
                    try:
                        resp = await client.get(url)
                        parsed = feedparser.parse(resp.text)
                        source = parsed.feed.get("title", url)
                        for entry in parsed.entries[:20]:
                            raw_snip = entry.get("summary", "") or entry.get("description", "")
                            from bs4 import BeautifulSoup as _BS2
                            snip = _BS2(raw_snip, "html.parser").get_text(separator=" ", strip=True)[:300]
                            pub_ts = 0
                            if entry.get("published_parsed"):
                                try:
                                    pub_ts = calendar.timegm(entry.published_parsed)
                                except Exception:
                                    pass
                            items.append({
                                "url": entry.get("link", ""),
                                "title": entry.get("title", "").strip(),
                                "snippet": snip,
                                "source": source,
                                "topic": topic_label,
                                "_pub_ts": pub_ts,
                            })
                    except Exception:
                        pass
            if items:
                _store_articles(items)
        except Exception:
            pass

app = FastAPI(title="Pulse")


@app.on_event("startup")
async def _startup() -> None:
    _init_db()
    asyncio.create_task(_bg_feed_refresh())

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


_MATH_HINT = (
    "When expressing mathematical equations, scientific formulas, or any symbolic "
    "expressions, use LaTeX notation: inline with $...$ and display blocks with $$...$$. "
    "For example: the quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$.\n\n"
)

def _build_prompt(depth: str, query: str, context: str) -> str:
    """Build a prompt that forces the model to output directly without asking questions."""
    if depth == "ultra_short":
        return (
            f'You are an automated summarization engine. The user searched for: "{query}"\n'
            f"Below are the search results. Your ONLY job is to output this exact format:\n\n"
            f"[two sentences, max 50 words summarising the topic]\n\n"
            f"**Key Points**:\n- [key point 1]\n- [key point 2]\n- [key point 3]\n\n"
            f"Output ONLY the above. No greetings, no questions, no suggestions. Begin immediately.\n\n"
            f"Search Results:\n{context}"
        )
    elif depth == "summary":
        return (
            f'You are an automated summarization engine. The user searched for: "{query}"\n'
            f"Below are the search results. Output this exact format, filled in with real information:\n\n"
            f"**Key Findings**: [most important information from the results]\n\n"
            f"**Notable Facts**: [key data points, statistics, names, dates]\n\n"
            f"**Best Sources**:\n- [URL 1]: [brief description]\n- [URL 2]: [brief description]\n\n"
            f"**Overview**: [concise paragraph synthesising everything]\n\n"
            f"Output ONLY the above. No greetings, no questions, no suggestions. Begin immediately.\n\n"
            f"Search Results:\n{context}"
        )
    else:  # detailed
        return (
            f'You are an automated research engine. The user searched for: "{query}"\n'
            f"Below are the search results. Output this exact report, filled in with real information:\n\n"
            f"## Background\n[Context about {query} and why it matters]\n\n"
            f"## Key Findings\n[All major findings from the sources]\n\n"
            f"## Important Facts & Data\n[Statistics, dates, names, figures]\n\n"
            f"## Different Perspectives\n[Contrasting viewpoints across sources]\n\n"
            f"## Best Resources\n- [URL 1]: [what it covers]\n- [URL 2]: [what it covers]\n\n"
            f"## Conclusion\n[Thorough synthesis with actionable insights]\n\n"
            f"Output ONLY the above report. No greetings, no questions, no suggestions. Begin immediately.\n\n"
            f"Search Results:\n{context}"
        )


PROMPTS: dict[str, str] = {}  # kept for import compatibility; use _build_prompt instead


class SearchRequest(BaseModel):
    query: str
    num_pages: int = 2
    concurrency: int = 5
    fetch_content: bool = True
    model: str = DEFAULT_MODEL
    summary_depth: str = "all"  # ultra_short | summary | detailed | all
    timelimit: str | None = None  # d | w | m | y | None
    provider: str = "groq"


def _ddg_search_sync(query: str, max_results: int, timelimit: str | None = None) -> list:
    """Synchronous DuckDuckGo search — runs in a thread pool."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results, timelimit=timelimit))
    except Exception as exc:
        raise RuntimeError(f"DuckDuckGo search failed: {exc}") from exc


async def _fetch_text(url: str, client: httpx.AsyncClient) -> str:
    """Fetch a URL and return cleaned text content."""
    try:
        resp = await client.get(url, timeout=12.0)
        if "text/html" not in resp.headers.get("content-type", ""):
            return ""
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()
        text = " ".join(soup.get_text(separator=" ", strip=True).split())
        return text[:8000]
    except Exception:
        return ""


async def stream_search(req: SearchRequest) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE-formatted events."""

    def evt(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    max_results = req.num_pages * 10
    yield evt({"type": "status", "message": f'Searching DuckDuckGo for "{req.query}"…'})

    # --- 1. Search ---
    loop = asyncio.get_running_loop()
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            raw_results = await loop.run_in_executor(
                pool, _ddg_search_sync, req.query, max_results, req.timelimit
            )
    except RuntimeError as exc:
        yield evt({"type": "error", "message": str(exc)})
        return

    if not raw_results:
        yield evt({"type": "error", "message": "No results found. Try a different query."})
        return

    total = len(raw_results)
    yield evt({
        "type": "status",
        "message": (
            f"Found {total} results. "
            f"{'Fetching page content' if req.fetch_content else 'Processing'} "
            f"with concurrency {req.concurrency}…"
        ),
    })

    # --- 2. Fetch page content concurrently ---
    semaphore = asyncio.Semaphore(req.concurrency)
    processed: list[dict] = []

    async with httpx.AsyncClient(
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        },
        follow_redirects=True,
    ) as http_client:

        async def process_one(raw: dict, idx: int) -> dict:
            url = raw.get("href", "")
            content = ""
            if req.fetch_content and url:
                async with semaphore:
                    content = await _fetch_text(url, http_client)
            record = {
                "index": idx,
                "title": raw.get("title") or "No title",
                "url": url,
                "snippet": raw.get("body", ""),
                "content": content,
                "content_length": len(content),
            }
            processed.append(record)
            return record

        tasks = [asyncio.create_task(process_one(r, i)) for i, r in enumerate(raw_results)]
        done_count = 0
        for coro in asyncio.as_completed(tasks):
            result = await coro
            done_count += 1
            yield evt({
                "type": "result",
                "result": {k: v for k, v in result.items() if k != "content"},
                "content_text": result.get("content", ""),
                "progress": f"{done_count}/{total}",
            })

    # --- 3. AI summarization (streaming via Groq) ---
    _DEPTH_LABELS = {"ultra_short": "Quick", "summary": "Summary", "detailed": "Detailed"}
    _MAX_FOR    = {"ultra_short": 8, "summary": 12, "detailed": 16}
    _LEN_FOR    = {"ultra_short": 500, "summary": 900, "detailed": 1400}

    _valid_depths = {"ultra_short", "summary", "detailed"}
    depths_to_run = (
        ["ultra_short", "summary", "detailed"]
        if req.summary_depth == "all"
        else [req.summary_depth if req.summary_depth in _valid_depths else "summary"]
    )
    sorted_results = sorted(processed, key=lambda x: x["index"])

    for i, depth in enumerate(depths_to_run):
        label = _DEPTH_LABELS[depth]
        yield evt({
            "type": "status",
            "message": f"Generating {label} summary ({i + 1}/{len(depths_to_run)}) with {req.model}…",
        })
        yield evt({"type": "summary_start", "depth": depth, "label": label})

        context_parts: list[str] = []
        for r in sorted_results[:_MAX_FOR[depth]]:
            part = f"### {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}"
            if r["content"]:
                part += f"\nContent preview: {r['content'][:_LEN_FOR[depth]]}"
            context_parts.append(part)
        context = "\n\n".join(context_parts)

        prompt = _MATH_HINT + _build_prompt(depth, req.query, context)
        try:
            async for chunk in _ai_stream(req.model, prompt, req.provider):
                yield evt({"type": "summary_chunk", "text": chunk, "depth": depth})
        except Exception as exc:
            yield evt({"type": "summary_chunk", "text": f"*Error generating {depth} summary: {exc}*", "depth": depth})

        yield evt({"type": "summary_done", "depth": depth})

    yield evt({"type": "done", "total": total})


# ── Groq / OpenAI-compatible helpers ────────────────────────────────────────


async def _ai_stream(model: str, prompt: str, provider: str = "groq") -> AsyncGenerator[str, None]:
    """Stream tokens from an OpenAI-compatible endpoint with automatic model fallback on rate limits."""
    if provider == "ollama":
        _base_url = OLLAMA_BASE_URL
        _api_key = "ollama"
        models_to_try = [model]
    else:
        _base_url = AI_BASE_URL
        _api_key = AI_API_KEY
        seen: set = set()
        models_to_try = []
        for m in [model] + GROQ_FALLBACK_MODELS:
            if m not in seen:
                seen.add(m)
                models_to_try.append(m)
    headers = {
        "Authorization": f"Bearer {_api_key}",
        "Content-Type": "application/json",
    }

    _transport = httpx.AsyncHTTPTransport(
        socket_options=[
            (socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1),
            (socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 15),
            (socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 5),
            (socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 6),
        ]
    )
    _timeout = httpx.Timeout(connect=30.0, read=None, write=None, pool=None)
    try:
        async with httpx.AsyncClient(transport=_transport, timeout=_timeout) as client:
            for try_model in models_to_try:
                payload = {
                    "model": try_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a general-purpose research assistant. "
                                "You answer questions on ANY topic — sports, history, science, "
                                "entertainment, politics, people, culture, and more. "
                                "Never refuse a question because it is not about programming. "
                                "NEVER ask the user clarifying questions — always write the requested summary or analysis directly using the provided search results. "
                                "If search results are provided, use them. Write the answer immediately."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "stream": True,
                }
                async with client.stream(
                    "POST",
                    f"{_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as resp:
                    if resp.status_code == 429:
                        await resp.aread()
                        continue  # rate limited — try next model in fallback chain
                    if resp.status_code != 200:
                        body = await resp.aread()
                        try:
                            err = json.loads(body)
                            msg = err.get("error", {}).get("message", str(resp.status_code))
                        except Exception:
                            msg = str(resp.status_code)
                        yield f"*AI API Error: {msg}*"
                        return
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        raw = line[len("data: "):]
                        if raw.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        chunk = (
                            data.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if chunk:
                            yield chunk
                    return  # successfully streamed
            yield "*Rate limit reached on all available models. Please try again in a moment.*"
    except httpx.ConnectError:
        yield f"\n\n*Error: Could not connect to AI endpoint at {_base_url}.*"
    except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout):
        yield f"\n\n*Error: AI endpoint timed out. The model may be loading — please try again.*"
    except Exception as exc:
        yield f"\n\n*Summarization error: {exc}*"


# ── Routes ──────────────────────────────────────────────────────────────────

@app.get("/models")
async def list_models():
    """Return the configured model."""
    return JSONResponse([DEFAULT_MODEL])


@app.get("/providers")
async def list_providers():
    """Return available providers and their model lists."""
    groq_models = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama3-70b-8192",
        "llama3-8b-8192",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
        "gemma-7b-it",
    ]
    ollama_models = []
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            ollama_root = OLLAMA_BASE_URL.rstrip("/")
            if ollama_root.endswith("/v1"):
                ollama_root = ollama_root[:-3]
            resp = await client.get(f"{ollama_root}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                ollama_models = [m["name"] for m in data.get("models", [])]
    except Exception:
        pass
    if not ollama_models:
        ollama_models = ["llama3.2", "qwen3:8b", "mistral", "gemma3:4b", "phi4", "deepseek-r1:7b"]
    return JSONResponse({
        "groq": groq_models,
        "ollama": ollama_models,
    })


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    with open(html_path, encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.post("/search/stream")
async def search_endpoint(req: SearchRequest):
    return StreamingResponse(
        stream_search(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Live feed ────────────────────────────────────────────────────────────────

import feedparser  # noqa: E402

LIVE_FEEDS: dict[str, list[str]] = {
    # ── All News (global aggregation across every topic) ──────────────────
    "all": [
        # Breaking / World
        "http://feeds.bbci.co.uk/news/rss.xml",
        "https://feeds.reuters.com/reuters/topNews",
        "https://www.aljazeera.com/xml/rss/all.xml",
        # Politics
        "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
        "http://feeds.bbci.co.uk/news/politics/rss.xml",
        # Tech
        "https://techcrunch.com/feed/",
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://www.theverge.com/rss/index.xml",
        "https://hnrss.org/frontpage",
        "https://www.engadget.com/rss.xml",
        # Finance
        "https://www.cnbc.com/id/10000664/device/rss/rss.html",
        "https://feeds.marketwatch.com/marketwatch/topstories/",
        # Sports
        "https://www.espn.com/espn/rss/news",
        "http://feeds.bbci.co.uk/sport/rss.xml",
        # Science
        "https://www.sciencedaily.com/rss/all.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
        # Health
        "https://feeds.bbci.co.uk/news/health/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
        # Environment
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml",
        # Entertainment
        "https://variety.com/feed/",
        "https://deadline.com/feed/",
        # AI / ML
        "https://techcrunch.com/category/artificial-intelligence/feed/",
        "https://venturebeat.com/category/ai/feed/",
        # Gaming
        "https://kotaku.com/rss",
        # Real Estate
        "https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml",
        "https://www.housingwire.com/feed/",
    ],
    "breaking": [
        "http://feeds.bbci.co.uk/news/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
        "https://feeds.npr.org/1001/rss.xml",
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://feeds.reuters.com/reuters/topNews",
        "https://feeds.skynews.com/feeds/rss/home.xml",
    ],
    "world": [
        "http://feeds.bbci.co.uk/news/world/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        "https://feeds.reuters.com/reuters/worldNews",
    ],
    "politics": [
        "http://feeds.bbci.co.uk/news/politics/rss.xml",
        "https://feeds.reuters.com/reuters/politicsNews",
        "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
    ],
    "sports": [
        "https://www.espn.com/espn/rss/news",
        "http://feeds.bbci.co.uk/sport/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
    ],
    "tech": [
        # Tier-1 daily drivers
        "https://techcrunch.com/feed/",
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://www.wired.com/feed/rss",
        "https://www.theverge.com/rss/index.xml",
        "https://venturebeat.com/feed/",
        "https://www.engadget.com/rss.xml",
        # Developer / engineer perspective
        "https://hnrss.org/frontpage",               # Hacker News top stories
        "https://dev.to/feed",
        "https://feed.infoq.com/",
        "https://feeds.feedburner.com/ThePragmaticEngineer",
        # Hardware & deep tech
        "https://www.tomshardware.com/feeds/all",
        "https://www.anandtech.com/rss/",
        "https://spectrum.ieee.org/feeds/feed.rss",
        # Mobile / consumer
        "https://9to5mac.com/feed/",
        "https://9to5google.com/feed/",
        "https://www.macrumors.com/macrumors.xml",
        # Security
        "https://www.bleepingcomputer.com/feed/",
        "https://krebsonsecurity.com/feed/",
        # Broader tech news
        "https://www.zdnet.com/news/rss.xml",
        "https://www.techradar.com/rss",
        "https://www.technologyreview.com/feed/",
        "http://rss.slashdot.org/Slashdot/slashdotMain",
    ],
    "finance": [
        "https://www.cnbc.com/id/10000664/device/rss/rss.html",   # CNBC Finance
        "https://finance.yahoo.com/news/rssindex",                  # Yahoo Finance
        "https://feeds.marketwatch.com/marketwatch/topstories/",    # MarketWatch
        "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",           # WSJ Markets
        "https://seekingalpha.com/market_currents.xml",             # Seeking Alpha
    ],
    "business": [
        "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
        "https://hbr.org/feed",
        "https://www.inc.com/rss/",
        "https://feeds.feedburner.com/entrepreneur/latest",
        "https://www.forbes.com/business/feed/",
    ],
    "science": [
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "https://www.sciencedaily.com/rss/all.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
    ],
    "usa": [
        "https://feeds.npr.org/1001/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/US.xml",
        "https://feeds.reuters.com/reuters/domesticNews",
    ],
    "india": [
        "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
        "https://www.thehindu.com/news/national/feeder/default.rss",
        "http://feeds.feedburner.com/ndtvnews-india-news",
    ],
    "china": [
        "https://www.scmp.com/rss/91/feed",
        "https://www.sixthtone.com/rss.xml",
        "https://www.chinadailyhk.com/rss/china_news.xml",
    ],
    "europe": [
        "http://feeds.bbci.co.uk/news/world/europe/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Europe.xml",
        "https://rss.dw.com/rdf/rss-en-all",
    ],
    "mideast": [
        "https://www.aljazeera.com/xml/rss/all.xml",
        "http://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
        "https://feeds.reuters.com/reuters/MENATopNews",
    ],
    "politics-usa": [
        "https://feeds.npr.org/1004/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
        "https://feeds.reuters.com/reuters/politicsNews",
    ],
    "politics-india": [
        "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
        "https://www.thehindu.com/news/national/feeder/default.rss",
        "http://feeds.feedburner.com/ndtvnews-india-news",
    ],
    "politics-china": [
        "https://www.scmp.com/rss/91/feed",
        "https://www.chinadailyhk.com/rss/china_news.xml",
        "https://www.sixthtone.com/rss.xml",
    ],
    "politics-europe": [
        "http://feeds.bbci.co.uk/news/world/europe/rss.xml",
        "https://rss.dw.com/rdf/rss-en-all",
        "https://rss.nytimes.com/services/xml/rss/nyt/Europe.xml",
    ],
    "politics-mideast": [
        "https://www.aljazeera.com/xml/rss/all.xml",
        "http://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
        "https://feeds.reuters.com/reuters/MENATopNews",
    ],
    "sports-usa": [
        "https://www.espn.com/espn/rss/news",
        "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
    ],
    "sports-india": [
        "http://feeds.feedburner.com/ndtvnews-sports",
        "https://timesofindia.indiatimes.com/rssfeeds/4719148.cms",
    ],
    "sports-europe": [
        "http://feeds.bbci.co.uk/sport/rss.xml",
        "https://www.skysports.com/rss/12040",
    ],
    "sports-mideast": [
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://feeds.reuters.com/reuters/MENATopNews",
    ],
    "tech-india": [
        "https://gadgets360.com/rss/news",
        "https://www.digit.in/rss/news.xml",
    ],
    "tech-china": [
        "https://www.scmp.com/rss/36/feed",
        "https://www.sixthtone.com/rss.xml",
    ],
    "tech-europe": [
        "https://rss.dw.com/rdf/rss-en-all",
        "https://feeds.arstechnica.com/arstechnica/index",
    ],
    "finance-usa": [
        "https://www.cnbc.com/id/10000664/device/rss/rss.html",    # CNBC Finance
        "https://feeds.marketwatch.com/marketwatch/topstories/",    # MarketWatch
        "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",           # WSJ Markets
        "https://finance.yahoo.com/news/rssindex",                  # Yahoo Finance
        "https://www.cnbc.com/id/15839135/device/rss/rss.html",    # CNBC Earnings
    ],
    "finance-india": [
        "https://economictimes.indiatimes.com/rssfeedstopstories.cms",
        "https://www.moneycontrol.com/rss/MCtopnews.xml",
    ],
    "finance-europe": [
        "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
        "https://rss.dw.com/rdf/rss-en-business",
    ],
    "finance-china": [
        "https://www.scmp.com/rss/92/feed",
    ],
    "finance-mideast": [
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://feeds.reuters.com/reuters/MENATopNews",
        "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    ],
    "business-usa": [
        "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
        "https://www.inc.com/rss/",
        "https://feeds.feedburner.com/entrepreneur/latest",
        "https://www.forbes.com/business/feed/",
    ],
    "business-india": [
        "https://economictimes.indiatimes.com/rssfeedstopstories.cms",
        "https://www.moneycontrol.com/rss/MCtopnews.xml",
        "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    ],
    "business-china": [
        "https://www.scmp.com/rss/92/feed",
        "https://www.sixthtone.com/rss.xml",
        "https://www.chinadailyhk.com/rss/china_news.xml",
    ],
    "business-europe": [
        "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
        "https://www.ft.com/rss/home",
        "https://rss.dw.com/rdf/rss-en-business",
    ],
    "business-mideast": [
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://feeds.reuters.com/reuters/MENATopNews",
    ],
    "science-usa": [
        "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
        "https://www.sciencedaily.com/rss/all.xml",
    ],
    "science-india": [
        "https://www.thehindu.com/sci-tech/science/feeder/default.rss",
        "https://timesofindia.indiatimes.com/rssfeeds/2886704.cms",
    ],
    "science-europe": [
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "https://rss.dw.com/rdf/rss-en-science",
    ],
    "health": [
        "https://feeds.bbci.co.uk/news/health/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
        "https://www.who.int/feeds/entity/news/en/rss.xml",
        "https://www.statnews.com/feed/",
        "https://www.medicalnewstoday.com/rss",
        "https://www.sciencedaily.com/rss/health_medicine.xml",
        "https://feeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC",
    ],
    "health-usa": [
        "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
        "https://www.statnews.com/feed/",
        "https://feeds.feedburner.com/MedpageToday",
        "https://feeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC",
        "https://www.medicinenet.com/rss/daily_health_news.xml",
    ],
    "health-india": [
        "https://timesofindia.indiatimes.com/rssfeeds/3908999.cms",
        "https://www.thehindu.com/sci-tech/health/feeder/default.rss",
        "http://feeds.feedburner.com/ndtvnews-india-news",
    ],
    "health-china": [
        "https://www.scmp.com/rss/4/feed",
        "https://www.sixthtone.com/rss.xml",
        "https://www.chinadailyhk.com/rss/china_news.xml",
    ],
    "health-europe": [
        "https://feeds.bbci.co.uk/news/health/rss.xml",
        "https://rss.dw.com/rdf/rss-en-all",
        "https://www.theguardian.com/society/health/rss",
    ],
    "health-mideast": [
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://www.who.int/feeds/entity/news/en/rss.xml",
        "https://feeds.reuters.com/reuters/MENATopNews",
    ],
    "environment": [
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml",
        "https://www.theguardian.com/environment/rss",
        "https://grist.org/feed/",
        "https://insideclimatenews.org/feed/",
        "https://www.carbonbrief.org/feed",
        "https://e360.yale.edu/feed",
        "https://www.climatechangenews.com/feed/",
    ],
    "environment-usa": [
        "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml",
        "https://grist.org/feed/",
        "https://insideclimatenews.org/feed/",
        "https://www.eenews.net/rss/rss.xml",
        "https://www.carbonbrief.org/feed",
    ],
    "environment-india": [
        "https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss",
        "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
        "https://www.downtoearth.org.in/rss/latest-news",
    ],
    "environment-china": [
        "https://www.scmp.com/rss/36/feed",
        "https://www.sixthtone.com/rss.xml",
        "https://www.chinadialogue.net/feed/",
    ],
    "environment-europe": [
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "https://www.theguardian.com/environment/rss",
        "https://www.climatechangenews.com/feed/",
        "https://www.euractiv.com/section/energy-environment/feed/",
    ],
    "environment-mideast": [
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://feeds.reuters.com/reuters/MENATopNews",
        "https://www.climatechangenews.com/feed/",
    ],

    # ── New topics ──────────────────────────────────────────────────────────
    "entertainment": [
        "https://variety.com/feed/",                          # Variety
        "https://www.hollywoodreporter.com/feed/",           # Hollywood Reporter
        "https://deadline.com/feed/",                        # Deadline
    ],
    "ai": [
        "https://techcrunch.com/category/artificial-intelligence/feed/",  # TechCrunch AI
        "https://venturebeat.com/category/ai/feed/",         # VentureBeat AI
        "https://aiweekly.co/issues.rss",                    # AI Weekly
        "https://feeds.feedburner.com/MachineLearningMastery", # ML Mastery
    ],
    "gaming": [
        "https://kotaku.com/rss",                            # Kotaku
        "https://www.ign.com/articles?tags=new-articles/rss.json",  # IGN
        "https://feeds.feedburner.com/ign/games-all",        # IGN Games
        "https://www.pcgamer.com/rss/",                      # PC Gamer
    ],
    "realestate": [
        "https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml",  # NYT Real Estate
        "https://www.housingwire.com/feed/",                 # HousingWire
        "https://www.realtor.com/news/feed/",                # Realtor.com
        "https://biggerpockets.com/blog/feed",               # BiggerPockets
    ],
}


# Importance weights for feeds used in the "all" aggregation.
# Higher = more likely to surface to the top when combined with recency.
# Scale: 3.0 (critical) → 1.0 (light)
_ALL_WEIGHTS: dict[str, float] = {
    # Breaking / World (critical)
    "http://feeds.bbci.co.uk/news/rss.xml":               3.0,
    "https://feeds.reuters.com/reuters/topNews":           3.0,
    "https://www.aljazeera.com/xml/rss/all.xml":          3.0,
    # Politics (high)
    "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml": 2.8,
    "http://feeds.bbci.co.uk/news/politics/rss.xml":      2.8,
    # Finance (high)
    "https://www.cnbc.com/id/10000664/device/rss/rss.html": 2.5,
    "https://feeds.marketwatch.com/marketwatch/topstories/": 2.5,
    # Tech / AI (medium-high)
    "https://techcrunch.com/feed/":                        2.2,
    "https://feeds.arstechnica.com/arstechnica/index":     2.2,
    "https://techcrunch.com/category/artificial-intelligence/feed/": 2.2,
    "https://venturebeat.com/category/ai/feed/":           2.2,
    # Health / Science (medium)
    "https://feeds.bbci.co.uk/news/health/rss.xml":        1.8,
    "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml": 1.8,
    "https://www.sciencedaily.com/rss/all.xml":            1.6,
    "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml": 1.6,
    # Environment (medium)
    "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml": 1.6,
    "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml": 1.6,
    # Real Estate (medium-low)
    "https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml": 1.4,
    "https://www.housingwire.com/feed/":                   1.4,
    # Entertainment / Gaming / Sports (light)
    "https://variety.com/feed/":                           1.2,
    "https://deadline.com/feed/":                          1.2,
    "https://kotaku.com/rss":                              1.0,
    "https://www.espn.com/espn/rss/news":                  1.0,
    "http://feeds.bbci.co.uk/sport/rss.xml":               1.0,
}

# Human-readable topic label for each feed URL (used in "all" aggregation)
_ALL_TOPIC_LABELS: dict[str, str] = {
    "http://feeds.bbci.co.uk/news/rss.xml":               "Breaking",
    "https://feeds.reuters.com/reuters/topNews":           "Breaking",
    "https://www.aljazeera.com/xml/rss/all.xml":          "World",
    "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml": "Politics",
    "http://feeds.bbci.co.uk/news/politics/rss.xml":      "Politics",
    "https://www.cnbc.com/id/10000664/device/rss/rss.html": "Finance",
    "https://feeds.marketwatch.com/marketwatch/topstories/": "Finance",
    "https://techcrunch.com/feed/":                        "Tech",
    "https://feeds.arstechnica.com/arstechnica/index":     "Tech",
    "https://techcrunch.com/category/artificial-intelligence/feed/": "AI",
    "https://venturebeat.com/category/ai/feed/":           "AI",
    "https://feeds.bbci.co.uk/news/health/rss.xml":        "Health",
    "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml": "Health",
    "https://www.sciencedaily.com/rss/all.xml":            "Science",
    "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml": "Science",
    "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml": "Environment",
    "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml": "Climate",
    "https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml": "Real Estate",
    "https://www.housingwire.com/feed/":                   "Real Estate",
    "https://variety.com/feed/":                           "Entertainment",
    "https://deadline.com/feed/":                          "Entertainment",
    "https://kotaku.com/rss":                              "Gaming",
    "https://www.espn.com/espn/rss/news":                  "Sports",
    "http://feeds.bbci.co.uk/sport/rss.xml":               "Sports",
}

# Fallback topic labels for single-topic tabs (used when use_weighted=False)
_KEY_TOPIC_LABELS: dict[str, str] = {
    "world": "World", "politics": "Politics", "sports": "Sports",
    "tech": "Tech", "finance": "Finance", "business": "Business",
    "science": "Science", "health": "Health", "environment": "Environment",
    "entertainment": "Entertainment", "ai": "AI", "gaming": "Gaming",
    "realestate": "Real Estate", "breaking": "Breaking",
    "usa": "USA", "india": "India", "china": "China",
    "europe": "Europe", "mideast": "Mideast",
}

# ── News importance keyword sets ─────────────────────────────────────────────
_BREAKING_KEYWORDS: frozenset = frozenset({
    "breaking", "urgent", "alert", "emergency", "attack", "explosion",
    "earthquake", "tsunami", "hurricane", "tornado", "killed", "dead",
    "shooting", "crash", "fire", "flood", "arrested", "indicted",
    "war", "invasion", "crisis", "collapse", "recall", "resign",
    "impeach", "outbreak", "pandemic", "hostage", "siege", "blast",
    "assassination", "missing", "wildfire", "avalanche", "poisoning",
    "evacuate", "evacuation", "massacre", "genocide", "chemical",
})
_HIGH_KEYWORDS: frozenset = frozenset({
    "major", "historic", "record", "landmark", "election", "vote",
    "court", "ruling", "verdict", "guilty", "sentenced", "acquitted",
    "agreement", "deal", "treaty", "summit", "sanction", "tariff",
    "ban", "strike", "inflation", "rate hike", "rate cut", "federal reserve",
    "lawsuit", "indictment", "protest", "riot", "investigation", "scandal",
    "impeachment", "breakthrough", "discovery", "first ever", "banned",
})


@app.get("/live/{category}")
async def get_live_feed(category: str):
    """90 articles from DB cache + only the newest 5-per-feed from RSS.
    Scales well: DB read is ~5 ms; RSS payloads are 4x smaller."""
    import math, time as _time, calendar

    key = category.lower()
    feeds = LIVE_FEEDS.get(key, [])
    if not feeds and "-" in key:
        topic, region = key.split("-", 1)
        feeds = LIVE_FEEDS.get(topic, []) or LIVE_FEEDS.get(region, [])
    if not feeds:
        return JSONResponse({"error": "Unknown category"}, status_code=404)

    use_weighted = (key == "all")
    now_ts   = _time.time()
    _lk      = key.split("-")[0] if "-" in key else key
    db_topic = _KEY_TOPIC_LABELS.get(_lk, "") if key != "all" else ""

    # ── Step 1: pull 90 articles from SQLite (instant) ────────────────
    with _db_lock:
        with sqlite3.connect(DB_PATH) as _con:
            _con.row_factory = sqlite3.Row
            if db_topic:
                _rows = _con.execute(
                    "SELECT url,title,snippet,source,topic,published,fetched_at"
                    " FROM articles WHERE topic=? ORDER BY fetched_at DESC LIMIT 90",
                    (db_topic,),
                ).fetchall()
            else:
                _rows = _con.execute(
                    "SELECT url,title,snippet,source,topic,published,fetched_at"
                    " FROM articles ORDER BY fetched_at DESC LIMIT 90",
                ).fetchall()

    db_urls: set[str] = set()
    db_items: list[dict] = []
    for row in _rows:
        url = row["url"]
        if not url or url in db_urls:
            continue
        db_urls.add(url)
        t = (row["title"] or "").lower()
        if any(kw in t for kw in _BREAKING_KEYWORDS):
            imp, boost = "breaking", 2.5
        elif any(kw in t for kw in _HIGH_KEYWORDS):
            imp, boost = "high", 0.9
        else:
            imp, boost = "normal", 0.0
        pub_ts = row["published"] or 0
        age_h  = (now_ts - pub_ts) / 3600 if pub_ts else 48
        score  = (1.5 + boost) * math.exp(-age_h / 6.0)
        pub_str = ""
        if pub_ts:
            try:
                pub_str = datetime.datetime.utcfromtimestamp(pub_ts).strftime(
                    "%a, %d %b %Y %H:%M UTC"
                )
            except Exception:
                pass
        db_items.append({
            "url": url, "title": row["title"] or "",
            "snippet": row["snippet"] or "", "source": row["source"] or "",
            "topic": row["topic"] or "", "published": pub_str,
            "published_ts": pub_ts, "fetched_at": row["fetched_at"] or 0,
            "importance": imp, "_score": score,
        })

    # ── Step 2: RSS — only 5 latest entries per feed ──────────────────
    rss_new: list[dict] = []
    async with httpx.AsyncClient(
        timeout=8.0,
        headers={"User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)"},
        follow_redirects=True,
    ) as client:
        async def fetch_feed(feed_url: str) -> list[dict]:
            try:
                resp   = await client.get(feed_url)
                parsed = feedparser.parse(resp.text)
                source = parsed.feed.get("title", feed_url)
                weight = _ALL_WEIGHTS.get(feed_url, 1.5) if use_weighted else 1.0
                topic_label = (
                    _ALL_TOPIC_LABELS.get(feed_url, "")
                    if use_weighted
                    else _KEY_TOPIC_LABELS.get(_lk, "")
                )
                items = []
                for entry in parsed.entries[:5]:   # ← 5 per feed (was 20)
                    url = entry.get("link", "")
                    if not url or url in db_urls:
                        continue                   # skip what DB already has
                    snippet = entry.get("summary", "") or entry.get("description", "")
                    from bs4 import BeautifulSoup as _BS
                    snippet = _BS(snippet, "html.parser").get_text(
                        separator=" ", strip=True
                    )[:300]
                    pub_ts = 0
                    if entry.get("published_parsed"):
                        try:
                            pub_ts = calendar.timegm(entry.published_parsed)
                        except Exception:
                            pass
                    elif entry.get("updated_parsed"):
                        try:
                            pub_ts = calendar.timegm(entry.updated_parsed)
                        except Exception:
                            pass
                    t = entry.get("title", "").lower()
                    if any(kw in t for kw in _BREAKING_KEYWORDS):
                        imp, boost = "breaking", 2.5
                    elif any(kw in t for kw in _HIGH_KEYWORDS):
                        imp, boost = "high", 0.9
                    else:
                        imp, boost = "normal", 0.0
                    age_h = (now_ts - pub_ts) / 3600 if pub_ts else 0.1
                    score = (weight + boost) * math.exp(-age_h / 6.0)
                    items.append({
                        "title": entry.get("title", "").strip(),
                        "url": url,
                        "snippet": snippet,
                        "source": source,
                        "published": entry.get("published", entry.get("updated", "")),
                        "published_ts": pub_ts or now_ts,
                        "topic": topic_label,
                        "importance": imp,
                        "_score": score,
                        "_pub_ts": pub_ts,
                    })
                return items
            except Exception:
                return []

        results = await asyncio.gather(*[fetch_feed(u) for u in feeds])
        for items in results:
            rss_new.extend(items)

    # ── Step 3: deduplicate RSS, store new to DB, merge & sort ────────
    seen_rss: set[str] = set()
    fresh: list[dict] = []
    to_store: list[dict] = []
    for item in rss_new:
        url = item["url"]
        if url and url not in seen_rss and url not in db_urls:
            seen_rss.add(url)
            to_store.append(item)
            fresh.append(item)

    if to_store:
        threading.Thread(
            target=_store_articles, args=(to_store,), daemon=True
        ).start()

    combined = fresh + db_items
    # Sort by publication time newest-first; breaking/high get a time bonus
    # so recent important news edges out recent fluff, but old news never tops fresh news
    _IMP_BONUS = {"breaking": 21600, "high": 7200}  # seconds (6h / 2h)
    combined.sort(
        key=lambda x: (x.get("published_ts") or x.get("fetched_at") or x.get("_pub_ts") or 0)
                      + _IMP_BONUS.get(x.get("importance", ""), 0),
        reverse=True
    )
    sliced = combined[:100]
    for item in sliced:
        item["score"] = round(item.pop("_score", 0.0), 4)
        item.pop("_pub_ts", None)

    return JSONResponse({
        "items": sliced,
        "from_cache": len(db_items),
        "from_rss": len(fresh),
        "category": category,
        "total": len(combined),
    })


@app.get("/live/{category}/cached")
async def get_live_feed_cached(category: str):
    """Instant first render from SQLite — no RSS fetch."""
    import math, time as _t
    key = category.lower()
    _lk = key.split("-")[0] if "-" in key else key
    topic_label = _KEY_TOPIC_LABELS.get(_lk, "") if key != "all" else ""
    now_ts = _t.time()

    with _db_lock:
        with sqlite3.connect(DB_PATH) as con:
            con.row_factory = sqlite3.Row
            if topic_label:
                rows = con.execute(
                    "SELECT url,title,snippet,source,topic,published,fetched_at"
                    " FROM articles WHERE topic=?"
                    " ORDER BY fetched_at DESC LIMIT 120",
                    (topic_label,),
                ).fetchall()
            else:
                rows = con.execute(
                    "SELECT url,title,snippet,source,topic,published,fetched_at"
                    " FROM articles ORDER BY fetched_at DESC LIMIT 150"
                ).fetchall()

    result = []
    for row in rows:
        title_lower = (row["title"] or "").lower()
        if any(kw in title_lower for kw in _BREAKING_KEYWORDS):
            importance, boost = "breaking", 2.5
        elif any(kw in title_lower for kw in _HIGH_KEYWORDS):
            importance, boost = "high", 0.9
        else:
            importance, boost = "normal", 0.0

        pub_ts = row["published"] or 0
        age_h  = (now_ts - pub_ts) / 3600 if pub_ts else 48
        score  = (1.5 + boost) * math.exp(-age_h / 6.0)

        # Format human-readable date from stored timestamp
        if pub_ts:
            try:
                pub_str = datetime.datetime.utcfromtimestamp(pub_ts).strftime(
                    "%a, %d %b %Y %H:%M UTC"
                )
            except Exception:
                pub_str = ""
        else:
            pub_str = ""

        result.append({
            "url":        row["url"],
            "title":      row["title"] or "",
            "snippet":    row["snippet"] or "",
            "source":     row["source"] or "",
            "topic":      row["topic"] or "",
            "published":  pub_str,
            "published_ts": pub_ts,
            "fetched_at": row["fetched_at"] or 0,
            "importance": importance,
            "_score":     score,
        })

    _IMP_BONUS = {"breaking": 21600, "high": 7200}
    result.sort(
        key=lambda x: (x.get("published_ts") or x.get("fetched_at") or 0)
                      + _IMP_BONUS.get(x.get("importance", ""), 0),
        reverse=True,
    )
    for item in result:
        item["score"] = round(item.pop("_score", 0.0), 4)
    return JSONResponse({
        "items": result,
        "from_cache": len(result),
        "from_rss": 0,
        "category": category,
        "total": len(result),
    })


class ArticleSummarizeRequest(BaseModel):
    title: str
    url: str
    snippet: str
    model: str = DEFAULT_MODEL
    provider: str = "groq"


@app.post("/live/summarize")
async def summarize_article(req: ArticleSummarizeRequest):
    """Stream a short AI summary of a news article. Fetches full body if snippet is short."""
    body_text = req.snippet
    # Try to get full article body for richer summaries
    if req.url:
        try:
            async with httpx.AsyncClient(
                timeout=12.0,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                follow_redirects=True,
            ) as _cl:
                _resp = await _cl.get(req.url)
                _soup = BeautifulSoup(_resp.text, "html.parser")
                for _tag in _soup(["script","style","nav","footer","header","aside","form","iframe","noscript"]):
                    _tag.decompose()
                _article = _soup.find("article") or _soup.find("main") or _soup
                _full = " ".join(_article.get_text(separator=" ", strip=True).split())
                if len(_full) > 200:
                    body_text = _full[:10000]
        except Exception:
            pass
    prompt = (
        f"Summarize this news article in 6-8 sentences covering all key facts. Be factual and detailed.\n\n"
        f"Title: {req.title}\n"
        f"Article content: {body_text}\n\n"
        f"Write the summary immediately. No preamble."
    )

    async def generate():
        try:
            async for chunk in _ai_stream(req.model, prompt, req.provider):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'text': f'*Error: {exc}*'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Article search endpoint ──────────────────────────────────────────────────

@app.get("/search/articles")
async def search_articles(q: str = "", limit: int = 40, topic: str = ""):
    """Full-text search over locally cached articles (SQLite FTS5)."""
    q = q.strip()
    if not q:
        return JSONResponse([])
    try:
        with sqlite3.connect(DB_PATH) as con:
            con.row_factory = sqlite3.Row
            if topic:
                rows = con.execute(
                    "SELECT a.url,a.title,a.snippet,a.source,a.topic,a.published"
                    " FROM articles a JOIN articles_fts f ON a.rowid=f.rowid"
                    " WHERE articles_fts MATCH ? AND a.topic=?"
                    " ORDER BY rank LIMIT ?",
                    (q, topic, limit),
                ).fetchall()
            else:
                rows = con.execute(
                    "SELECT a.url,a.title,a.snippet,a.source,a.topic,a.published"
                    " FROM articles a JOIN articles_fts f ON a.rowid=f.rowid"
                    " WHERE articles_fts MATCH ?"
                    " ORDER BY rank LIMIT ?",
                    (q, limit),
                ).fetchall()
            return JSONResponse([dict(r) for r in rows])
    except Exception as exc:
        # FTS syntax errors → fallback to LIKE
        try:
            with sqlite3.connect(DB_PATH) as con2:
                con2.row_factory = sqlite3.Row
                pat = f"%{q}%"
                rows2 = con2.execute(
                    "SELECT url,title,snippet,source,topic,published FROM articles"
                    " WHERE title LIKE ? OR snippet LIKE ?"
                    " ORDER BY fetched_at DESC LIMIT ?",
                    (pat, pat, limit),
                ).fetchall()
                return JSONResponse([dict(r) for r in rows2])
        except Exception:
            return JSONResponse({"error": str(exc)}, status_code=500)

# ── AI search summary endpoint ────────────────────────────────────────────────────────────────────────

class SearchSummaryRequest(BaseModel):
    q: str
    articles: list[dict]
    model: str = DEFAULT_MODEL
    provider: str = "groq"


@app.post("/search/ai-summary")
async def search_ai_summary(req: SearchSummaryRequest):
    if not req.articles:
        return JSONResponse({"error": "No articles"}, status_code=400)
    articles_text = "\n".join(
        f"{i+1}. [{item.get('source', '')}] {item.get('title', '')} \u2014 {(item.get('snippet', '') or '')[:200]}"
        for i, item in enumerate(req.articles[:15])
    )
    prompt = (
        f'The user searched for: "{req.q}"\n\n'
        f"Here are the top matching news articles:\n{articles_text}\n\n"
        "Write a 3-4 sentence synthesis of what is currently happening on this topic. "
        "Be factual, concise, and grounded in the articles above.\n"
        "Then on a new line write exactly: ENTITIES: [comma-separated key people, companies, or organizations]\n"
        "Then on a new line write exactly: TOPICS: [comma-separated related sub-topics worth exploring]\n\n"
        "Write the synthesis immediately. No preamble or headers before it."
    )

    async def generate():
        async for chunk in _ai_stream(req.model, prompt, req.provider):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )



# ── Article body endpoint ────────────────────────────────────────────────────

@app.get("/article/body")
async def get_article_body(url: str):
    """Fetch and extract full article body text for richer AI summaries."""
    if not url.startswith(("http://", "https://")):
        return JSONResponse({"error": "Invalid URL"}, status_code=400)
    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script","style","nav","footer","header","aside","form","iframe","noscript"]):
                tag.decompose()
            article = soup.find("article") or soup.find("main") or soup
            text = " ".join(article.get_text(separator=" ", strip=True).split())
            return JSONResponse({"text": text[:6000], "length": len(text)})
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)


# ── Trending keywords endpoint ───────────────────────────────────────────────

@app.get("/trending")
async def get_trending(days: int = 3, limit: int = 25):
    """Return top keywords from recently cached articles."""
    import collections

    STOPWORDS = {
        "the","a","an","is","are","was","were","be","been","being","have","has","had",
        "do","does","did","will","would","could","should","may","might","can","to","of",
        "in","for","on","with","at","by","from","up","as","into","and","but","or","nor",
        "not","no","this","that","these","those","i","me","my","we","our","you","your",
        "he","she","it","they","them","his","her","its","their","about","all","more",
        "new","say","says","said","after","first","also","there","who","which","what",
        "how","when","where","over","than","then","now","so","if","one","two","three",
        "just","been","some","many","most","other","its","its","amid","amid","after",
        "before","during","while","than","though","since","news","report","reports",
    }
    cutoff = _time_mod.time() - days * 86400
    try:
        with sqlite3.connect(DB_PATH) as con:
            rows = con.execute(
                "SELECT title || ' ' || snippet FROM articles WHERE fetched_at > ? LIMIT 3000",
                (cutoff,),
            ).fetchall()
        word_counts: collections.Counter = collections.Counter()
        for (text,) in rows:
            for w in re.findall(r"[A-Z][a-z]{2,}(?:[A-Z][a-z]+)*|[A-Z]{2,}", text):
                if w.lower() not in STOPWORDS and len(w) >= 4:
                    word_counts[w] += 1
        top = [{"word": w, "count": c} for w, c in word_counts.most_common(limit)]
        return JSONResponse(top)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)



# ── Digest: per-topic summaries from DB ──────────────────────────────────────

class _DigestReq(BaseModel):
    topic: str
    hours: float = 24.0
    model: str = DEFAULT_MODEL
    provider: str = "groq"


@app.get("/digest/stats")
async def digest_stats(hours: float = 24.0):
    """Return per-topic article counts + data-gap warning for the time window."""
    import time as _t, datetime as _dt
    now = _t.time()
    cutoff = now - hours * 3600
    with _db_lock:
        with sqlite3.connect(DB_PATH) as con:
            con.row_factory = sqlite3.Row
            rows = con.execute(
                "SELECT topic, COUNT(*) as cnt, MIN(fetched_at) as oldest, MAX(fetched_at) as newest"
                " FROM articles WHERE fetched_at >= ? AND topic != ''"
                " GROUP BY topic ORDER BY cnt DESC",
                (cutoff,),
            ).fetchall()
            coverage = con.execute(
                "SELECT MIN(fetched_at) as db_oldest, MAX(fetched_at) as db_newest,"
                " COUNT(*) as total FROM articles WHERE fetched_at > 0"
            ).fetchone()

    topics = [{"topic": r["topic"].lower(), "count": r["cnt"],
               "oldest": r["oldest"], "newest": r["newest"]} for r in rows]

    # Gap detection: if newest article is old, server was likely offline
    gap_warning = None
    gap_ts = None
    if coverage and coverage["db_newest"]:
        age = now - coverage["db_newest"]
        if age > 7200:  # more than 2 hours since last article
            gap_ts = coverage["db_newest"]
            gap_warning = round(age / 3600, 1)

    return JSONResponse({
        "topics": topics,
        "hours": hours,
        "gap_warning": gap_warning,
        "gap_ts": gap_ts,
        "total_in_window": sum(t["count"] for t in topics),
    })


@app.post("/digest/generate")
async def digest_generate(req: _DigestReq):
    import time as _t
    since = _t.time() - req.hours * 3600
    with _db_lock:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT title, snippet, source FROM articles "
            "WHERE LOWER(topic)=LOWER(?) AND fetched_at>=? ORDER BY fetched_at DESC LIMIT 60",
            (req.topic, since),
        ).fetchall()
        con.close()
    rows = [dict(r) for r in rows]

    if not rows:
        return JSONResponse(
            {"error": f"No articles found for '{req.topic}' in this window. "
                      "The DB may not have collected data for this period yet."},
            status_code=404,
        )

    topic_label = _KEY_TOPIC_LABELS.get(req.topic, req.topic.title())
    hrs = req.hours
    window_label = (f"{int(hrs)}h" if hrs < 24
                    else f"{int(hrs // 24)}d" if hrs % 24 == 0
                    else f"{hrs:.0f}h")

    articles_text = "\n\n".join(
        "\u2022 {} ({})\n  {}".format(r["title"], r["source"], (r["snippet"] or "")[:250])
        for r in rows
    )

    prompt = (
        f"You are a professional news analyst. Summarize the most important {topic_label} "
        f"news developments from the past {window_label} based on these {len(rows)} articles.\n\n"
        f"{articles_text}\n\n"
        f"Write a clear, factual digest in 3-5 paragraphs. Be specific about names, figures, "
        f"and events. Do not add disclaimers about your knowledge cutoff.\n\n"
        "End your response with exactly this line (no extra text after it):\n"
        "KEY_POINTS: <concise point 1> | <concise point 2> | <concise point 3>"
    )

    async def _stream():
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                async with client.stream(
                    "POST", f"{OLLAMA_BASE_URL if req.provider == 'ollama' else AI_BASE_URL}/chat/completions",
                    headers={"Authorization": f"Bearer {'ollama' if req.provider == 'ollama' else AI_API_KEY}", "Content-Type": "application/json"},
                    json={"model": req.model, "messages": [{"role": "user", "content": prompt}], "stream": True},
                ) as r:
                    async for line in r.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        raw = line[len("data: "):]
                        if raw.strip() == "[DONE]":
                            yield "data: " + json.dumps({"done": True}) + "\n\n"
                            return
                        try:
                            chunk = json.loads(raw)
                            text = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if text:
                                yield "data: " + json.dumps({"text": text}) + "\n\n"
                        except Exception:
                            pass
        except httpx.ConnectError:
            yield "data: " + json.dumps({"error": "Cannot connect to AI endpoint."}) + "\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
