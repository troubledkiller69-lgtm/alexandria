#!/usr/bin/env python3
"""Local static server + debug ingest + TMDB/Supabase API shims for Alexandria."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
LOG_PATH = ROOT / ".cursor" / "debug-31a370.log"
PORT = 5500
ALLOWED_ROOTS = {"trending", "discover", "movie", "tv", "search", "collection", "person"}


def load_env():
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


load_env()


def http_json(url: str, timeout: float = 12.0):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Alexandria-DebugServer"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        return resp.status, dict(resp.headers.items()), body


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send_json(self, status: int, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Debug-Session-Id")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/config":
            return self._send_json(200, {
                "supabaseUrl": os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL"),
                "supabaseAnonKey": os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY"),
            })

        if path == "/api/proxy":
            endpoint = (qs.get("endpoint") or [None])[0]
            api_key = os.environ.get("TMDB_API_KEY")
            if not endpoint:
                return self._send_json(400, {"error": "A valid endpoint is required."})
            if not api_key:
                return self._send_json(503, {
                    "error": "TMDB is not configured locally. Add TMDB_API_KEY to .env.local (copy from Vercel)."
                })
            try:
                target = urllib.parse.urljoin("https://api.themoviedb.org/3/", endpoint.lstrip("/"))
                parsed_t = urlparse(target)
                if parsed_t.netloc != "api.themoviedb.org" or not parsed_t.path.startswith("/3/"):
                    return self._send_json(400, {"error": "Unsupported TMDB endpoint."})
                root = parsed_t.path[len("/3/"):].split("/")[0]
                if root not in ALLOWED_ROOTS:
                    return self._send_json(400, {"error": "Unsupported TMDB endpoint."})
                q = dict(parse_qs(parsed_t.query, keep_blank_values=True))
                flat = {k: v[-1] if isinstance(v, list) else v for k, v in q.items()}
                flat.pop("api_key", None)
                flat["api_key"] = api_key
                if "language" not in flat:
                    flat["language"] = "en-US"
                url = f"{parsed_t.scheme}://{parsed_t.netloc}{parsed_t.path}?{urllib.parse.urlencode(flat)}"
                status, _, body = http_json(url)
                return self._send_bytes(status, body, "application/json")
            except Exception as exc:  # noqa: BLE001
                return self._send_json(502, {"error": f"Failed to fetch data from TMDB: {exc}"})

        if path == "/api/omdb":
            api_key = os.environ.get("OMDB_API_KEY")
            imdb_id = (qs.get("i") or [None])[0]
            if not api_key:
                return self._send_json(503, {"error": "OMDb is not configured on this deployment."})
            if not imdb_id:
                return self._send_json(400, {"error": "A valid IMDb id is required (tt…)."})
            try:
                url = f"https://www.omdbapi.com/?i={urllib.parse.quote(imdb_id)}&apikey={urllib.parse.quote(api_key)}"
                status, _, body = http_json(url)
                return self._send_bytes(status, body, "application/json")
            except Exception as exc:  # noqa: BLE001
                return self._send_json(502, {"error": str(exc)})

        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/__dbg", "/ingest"):
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8", errors="replace") or "{}")
        except json.JSONDecodeError:
            payload = {"raw": raw.decode("utf-8", errors="replace")}
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if self.command in ("POST",) or self.path.startswith("/api/"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    has_tmdb = bool(os.environ.get("TMDB_API_KEY"))
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Alexandria debug server http://127.0.0.1:{PORT}")
    print(f"Writing logs to {LOG_PATH}")
    print(f"TMDB_API_KEY: {'yes' if has_tmdb else 'MISSING — create .env.local (copy from Vercel)'}")
    httpd.serve_forever()
