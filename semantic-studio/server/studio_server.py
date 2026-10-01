#!/usr/bin/env python3
"""Serve Semantic Studio: the static site plus a read-only SPARQL endpoint over its knowledge graph.

    python semantic-studio/server/studio_server.py [--site DIR] [--host 127.0.0.1] [--port 8787]

  /          the static site (semantic-studio/build/site, built by `make studio`)
  /sparql    SPARQL 1.1 query endpoint (GET ?query=... or POST, form-encoded or application/sparql-query)
             over data/kg.trig: one named graph per source file; the default graph is their union.
             Queries only: SPARQL Update, SERVICE and FROM / FROM NAMED are rejected, so a query can't
             reach files or URLs outside the graph. Results are capped (--max-rows) and time-limited
             (--timeout seconds). Cross-origin requests only from --cors-origin.

Standard library + rdflib only (already in enterprise-semantic-governance/requirements.txt).
"""
from __future__ import annotations

import argparse
import concurrent.futures
import functools
import json
import re
import sys
import time
import urllib.parse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import rdflib.plugins.sparql as rdflib_sparql
from rdflib import Dataset
from rdflib.plugins.sparql.parser import parseQuery
from rdflib.query import Result

# Never let a query reach outside the exported graph: no FROM / FROM NAMED loading of other graphs (files or
# URLs) and no SERVICE calls (checked in Store.check).
rdflib_sparql.SPARQL_LOAD_GRAPHS = False

HERE = Path(__file__).resolve().parent


class Store:
    def __init__(self, trig: Path, max_rows: int, timeout: float):
        t0 = time.time()
        self.ds = Dataset(default_union=True)
        self.ds.parse(str(trig), format="trig")
        self.size = len(self.ds)
        self.max_rows, self.timeout = max_rows, timeout
        # A query that runs past the timeout is answered with 503 but keeps its worker until it finishes;
        # with all workers busy, later queries wait. Fine for a team viewer; not a public endpoint.
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
        print(f"SPARQL: loaded {self.size} triples in {len(list(self.ds.graphs()))} graphs "
              f"from {trig} ({time.time() - t0:.1f}s)")

    @staticmethod
    def check(q: str) -> str | None:
        """Why the query is refused, or None. Only the query grammar parses, so updates are refused here too."""
        try:
            parsed = repr(parseQuery(q))
        except Exception as e:  # noqa: BLE001
            if re.search(r"(?i)\b(insert|delete)\s+(data|where|\{)|\b(load|clear|drop|create)\s", q):
                return "This endpoint is read-only: SPARQL Update is not accepted."
            return f"{type(e).__name__}: {e}"
        if "ServiceGraphPattern" in parsed:
            return "SERVICE is not allowed: queries run over the exported knowledge graph only."
        if "DatasetClause" in parsed:
            return "FROM / FROM NAMED are not allowed: use GRAPH <...> to pick a source file's named graph."
        return None

    def query(self, q: str) -> tuple[int, str, bytes]:
        refused = self.check(q)
        if refused:
            return 400, "text/plain", refused.encode()
        try:
            res: Result = self.pool.submit(self.ds.query, q).result(timeout=self.timeout)
            if res.type in ("SELECT", "ASK"):
                if res.type == "SELECT":
                    rows = list(res)
                    truncated = len(rows) > self.max_rows
                    data = json.loads(res.serialize(format="json"))
                    if truncated:
                        data["results"]["bindings"] = data["results"]["bindings"][: self.max_rows]
                        data["truncated"] = True
                    return 200, "application/sparql-results+json", json.dumps(data).encode()
                return 200, "application/sparql-results+json", res.serialize(format="json")
            graph = res.graph
            if graph is not None and len(graph) > self.max_rows * 10:
                return 400, "text/plain", f"The result has {len(graph)} triples; narrow the query (limit {self.max_rows * 10}).".encode()
            return 200, "text/turtle; charset=utf-8", res.serialize(format="turtle")
        except concurrent.futures.TimeoutError:
            return 503, "text/plain", f"Query took longer than {self.timeout:.0f}s and was abandoned.".encode()
        except Exception as e:  # noqa: BLE001 - evaluation errors go back to the user
            return 400, "text/plain", f"{type(e).__name__}: {e}".encode()


class Handler(SimpleHTTPRequestHandler):
    store: Store | None = None
    cors_origin: str = ""   # set with --cors-origin when the site is served from another host

    def end_headers(self):
        if self.path.startswith("/data/") or self.path in ("/", "/index.html", "/config.json"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _sparql(self, q: str | None):
        if not q:
            return self._send(400, "text/plain", b"Missing 'query'.")
        if self.store is None:
            return self._send(503, "text/plain", b"No knowledge graph loaded (data/kg.trig missing).")
        self._send(*self.store.query(q))

    def _send(self, status: int, ctype: str, body: bytes):
        self.send_response(status)
        if self.cors_origin:
            self.send_header("Access-Control-Allow-Origin", self.cors_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/sparql":
            return self._sparql(urllib.parse.parse_qs(url.query).get("query", [None])[0])
        return super().do_GET()

    def do_OPTIONS(self):  # noqa: N802 - CORS preflight for /sparql
        self.send_response(204)
        if self.cors_origin:
            self.send_header("Access-Control-Allow-Origin", self.cors_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.end_headers()

    def do_POST(self):  # noqa: N802
        url = urllib.parse.urlsplit(self.path)
        if url.path != "/sparql":
            return self._send(405, "text/plain", b"Read-only site.")
        try:
            n = max(0, int(self.headers.get("Content-Length") or 0))
        except ValueError:
            n = 0
        raw = self.rfile.read(min(n, 1_000_000)).decode("utf-8", "replace")
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip()
        q = raw if ctype == "application/sparql-query" else urllib.parse.parse_qs(raw).get("query", [None])[0]
        return self._sparql(q)

    def log_request(self, code="-", size="-"):
        # quiet for files; log queries and errors
        if "/sparql" in str(getattr(self, "requestline", "")) or str(code) >= "400":
            super().log_request(code, size)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default=str(HERE.parent / "build" / "site"))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--max-rows", type=int, default=5000)
    ap.add_argument("--timeout", type=float, default=30.0)
    ap.add_argument("--cors-origin", default="", help="allow a site on this origin (e.g. https://studio.example.com) "
                    "to query /sparql; default: same origin only")
    a = ap.parse_args()
    site = Path(a.site).resolve()
    if not (site / "index.html").exists():
        print(f"ERROR: no site in {site}. Build it first: make studio")
        return 1
    trig = site / "data" / "kg.trig"
    Handler.store = Store(trig, a.max_rows, a.timeout) if trig.exists() else None
    Handler.cors_origin = a.cors_origin
    httpd = ThreadingHTTPServer((a.host, a.port), functools.partial(Handler, directory=str(site)))
    shown = "localhost" if a.host in ("0.0.0.0", "127.0.0.1") else a.host
    print(f"Semantic Studio: http://{shown}:{a.port}/   (SPARQL: /sparql)   Ctrl-C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
