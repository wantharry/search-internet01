import asyncio
import json
import os
import re
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

load_dotenv()

OLLAMA_BASE = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")

app = FastAPI(title="AI Internet Search")

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
            f"**TL;DR**: [one sentence, max 25 words summarising the topic]\n\n"
            f"**Key Points**:\n- [key point 1]\n- [key point 2]\n- [key point 3]\n\n"
            f"**Top Link**: [most useful URL]\n\n"
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


def _ddg_search_sync(query: str, max_results: int) -> list:
    """Synchronous DuckDuckGo search — runs in a thread pool."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
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
                pool, _ddg_search_sync, req.query, max_results
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

    # --- 3. Ollama summarization (streaming) ---
    _DEPTH_LABELS = {"ultra_short": "Ultra Short", "summary": "Summary", "detailed": "Detailed"}
    _MAX_FOR    = {"ultra_short": 10, "summary": 15, "detailed": 20}
    _LEN_FOR    = {"ultra_short": 300, "summary": 900, "detailed": 1500}

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
        async for chunk in _ollama_stream(req.model, prompt):
            yield evt({"type": "summary_chunk", "text": chunk, "depth": depth})

        yield evt({"type": "summary_done", "depth": depth})

    yield evt({"type": "done", "total": total})


# ── Ollama helpers ──────────────────────────────────────────────────────────

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


async def _ollama_stream(model: str, prompt: str) -> AsyncGenerator[str, None]:
    """Stream tokens from Ollama, stripping <think>…</think> blocks."""
    payload: dict = {
        "model": model,
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
    # Disable built-in thinking for qwen3 to keep output clean
    if model.startswith("qwen3"):
        payload["think"] = False

    buf = ""  # accumulate to handle think-blocks that span chunks
    in_think = False

    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", f"{OLLAMA_BASE}/api/chat", json=payload
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    chunk = data.get("message", {}).get("content", "")
                    if chunk:
                        buf += chunk
                        # Strip complete think blocks accumulated so far
                        buf = _THINK_RE.sub("", buf)
                        # Handle partial opening tag
                        if "<think>" in buf and "</think>" not in buf:
                            in_think = True
                            buf = buf.split("<think>")[0]
                        elif "</think>" in buf:
                            in_think = False
                        if buf and not in_think:
                            yield buf
                            buf = ""
                    if data.get("done"):
                        break
        if buf and not in_think:
            yield buf
    except httpx.ConnectError:
        yield "\n\n*Error: Could not connect to Ollama. Is it running at " + OLLAMA_BASE + "?*"
    except Exception as exc:
        yield f"\n\n*Summarization error: {exc}*"


# ── Routes ──────────────────────────────────────────────────────────────────

@app.get("/models")
async def list_models():
    """Return list of locally installed Ollama models."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE}/api/tags")
            data = resp.json()
            return JSONResponse([m["name"] for m in data.get("models", [])])
    except Exception:
        return JSONResponse([])


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
