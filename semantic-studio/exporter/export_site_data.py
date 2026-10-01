#!/usr/bin/env python3
"""Export everything Semantic Studio shows into static files (semantic-studio/build/site/data/).

    python semantic-studio/exporter/export_site_data.py [--out DIR] [--skip-live]

The studio never reads the repositories directly: it reads what this script writes, so every page is a
view of one commit. Run by `make studio` (and `make studio-data`); nothing here changes a governed file.

Writes
  meta.json      commit, branch, build time, base IRI, FIBO release and pin, prefixes, repositories
  graph.json     every triple of every governed RDF file, plus the 12 FIBO profile modules (and FIBO/OMG
                 labels and parents from build/closure.ttl where a domain has one), each tagged with its file
  kg.trig        the same triples as a dataset, one named graph per file (the SPARQL endpoint loads it)
  docs.json      the markdown documents (framework, standards, ADRs, READMEs, modelling notes)
  cards.json     GraphRAG concept cards and edges of every sub-domain (semtool cards)
  health.json    last run reports (build/reports/*.json from make verify / hermit / selftest), plus drift (G8)
                 and template alignment checked live at export time, and the upstream defect register
  files/<path>   the text of every governed source file, for the source viewer
"""
from __future__ import annotations

import argparse
import contextlib
import datetime
import glob
import io
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml
from rdflib import BNode, Dataset, Graph, Literal, URIRef
from rdflib.namespace import OWL, RDF, RDFS, SKOS

ROOT = Path(__file__).resolve().parents[2]          # monorepo root
sys.path.insert(0, str(ROOT / "enterprise-governance" / "tools"))
import semtool  # noqa: E402

TEXT_SUFFIXES = {".ttl", ".trig", ".yaml", ".yml", ".rq", ".json", ".md", ".csv", ".txt"}
SKIP_PARTS = {".git", "venv", ".venv", "build", "node_modules", "vendor", "__pycache__", "_template-check"}
GRAPH_PREFIX = "urn:x-semantic-studio:file/"        # named graph of each source file in kg.trig


def rel(p: Path) -> str:
    return str(Path(p).resolve().relative_to(ROOT))


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True).stdout.strip()
    except OSError:
        return ""


# =============================================================================
# repositories
# =============================================================================

def discover_repos() -> list[semtool.Repo]:
    paths = [ROOT / "enterprise-governance", ROOT / "fibo-extensions"]
    paths += sorted(p.parent for p in (ROOT / "domains").glob("*/semantic.yaml"))
    paths += sorted(p.parent for p in (ROOT / "domains").glob("*/*/semantic.yaml"))
    return [semtool.Repo(p) for p in paths if (p / "semantic.yaml").exists()]


def file_roles(repo: semtool.Repo) -> dict[str, str]:
    """file -> the asset kind semantic.yaml declares it under (ontology, rules, apis, ...)."""
    roles: dict[str, str] = {}
    for key in (repo.cfg.get("paths") or {}):
        for f in repo.files(key):
            roles.setdefault(rel(f), key)
    for kind, pats in (repo.cfg.get("examples") or {}).items():
        for pat in ([pats] if isinstance(pats, str) else pats or []):
            for f in glob.glob(str(repo.root / pat)):
                roles[rel(Path(f))] = "examples-" + kind
                if f.endswith((".yaml", ".yml")):     # negative cases: the expectations file and its .ttl siblings
                    for t in Path(f).parent.glob("*.ttl"):
                        roles[rel(t)] = "examples-" + kind
    return roles


def repo_record(repo: semtool.Repo, roles: dict[str, str]) -> dict:
    cfg = repo.cfg
    dom = cfg.get("domain") or {}
    rid = rel(repo.root)
    files = []
    nested = {n.parent for n in repo.root.rglob("semantic.yaml") if n.parent != repo.root}
    for p in sorted(repo.root.rglob("*")):
        parts = set(p.relative_to(repo.root).parts)
        if not p.is_file() or parts & SKIP_PARTS or p.name == ".DS_Store" or any(n in p.parents for n in nested):
            continue
        r = rel(p)
        files.append({"path": r, "size": p.stat().st_size, "role": roles.get(r)})
    # negative test cases and competency questions (YAML, read here so the browser needs no YAML parser)
    negative = []
    neg = (cfg.get("examples") or {}).get("negative")
    for f in ([neg] if isinstance(neg, str) else neg or []):
        for path in glob.glob(str(repo.root / f)):
            if path.endswith((".yaml", ".yml")):
                for case in (yaml.safe_load(Path(path).read_text()) or {}).get("cases") or []:
                    case = dict(case)
                    case["path"] = rel(Path(path).parent / case.get("file", ""))
                    negative.append(case)
    cqs = []
    if repo.kind == "domain":
        for f in sorted(glob.glob(str(repo.root / cfg.get("competency_questions", "competency-questions/*.yaml")))):
            spec = yaml.safe_load(Path(f).read_text()) or {}
            q = spec.get("query")
            cqs.append({"id": spec.get("id"), "question": spec.get("question"), "path": rel(Path(f)),
                        "query_path": rel(Path(f).parent / q) if q else None,
                        "query": (Path(f).parent / q).read_text() if q and (Path(f).parent / q).exists() else None,
                        "bindings": spec.get("bindings") or {}, "expect": spec.get("expect") or {},
                        "tool": spec.get("tool")})
    return {
        "id": rid,
        "negative_tests": negative,
        "competency_questions": cqs,
        "name": dom.get("name") or {"governance": "Enterprise governance",
                                    "fibo-extensions": "FIBO extensions"}.get(repo.kind, repo.root.name),
        "kind": repo.kind,
        "folder": repo.root.name,
        "code": dom.get("code"),
        "prefix": dom.get("prefix"),
        "namespace": dom.get("namespace"),
        "parent": rel(repo.root.parent) if repo.kind == "domain" and (repo.root.parent / "semantic.yaml").exists() else None,
        "sub_domains": [rel(repo.root / p) for p in cfg.get("sub_domains") or []],
        "dependencies": [rel(repo.root / p) for p in cfg.get("dependencies") or []] if repo.kind == "domain" else [],
        "readme": rel(repo.root / "README.md") if (repo.root / "README.md").exists() else None,
        "config": {k: v for k, v in cfg.items() if k not in ("paths",)},
        "paths": cfg.get("paths") or {},
        "files": files,
    }


# =============================================================================
# graph
# =============================================================================

class GraphExport:
    """Triples in a compact form: node and literal tables, and [s, p, o, file] rows, where o >= 0 is a
    node and o < 0 is literal -o-1. Blank nodes are kept (as _:ids) so shapes and restrictions can be shown."""

    def __init__(self):
        self.nodes: list[str] = []
        self.node_ix: dict[str, int] = {}
        self.lits: list[list] = []
        self.lit_ix: dict[tuple, int] = {}
        self.files: list[str] = []
        self.triples: list[list[int]] = []
        self.prefixes: dict[str, str] = {}
        self.dataset = Dataset()
        self.seen: set[tuple] = set()

    def node(self, t) -> int:
        key = f"_:{t}" if isinstance(t, BNode) else str(t)
        if key not in self.node_ix:
            self.node_ix[key] = len(self.nodes)
            self.nodes.append(key)
        return self.node_ix[key]

    def lit(self, t: Literal) -> int:
        key = (str(t), t.language, str(t.datatype) if t.datatype else None)
        if key not in self.lit_ix:
            self.lit_ix[key] = len(self.lits)
            self.lits.append(list(key))
        return -self.lit_ix[key] - 1

    def add_graph(self, g: Graph, source: str, *, bnode_scope: str, keep=lambda t: True):
        fi = len(self.files)
        self.files.append(source)
        named = self.dataset.graph(URIRef(GRAPH_PREFIX + source))
        # blank-node ids are per file: make them unique across files
        rename = {}

        def b(t):
            if isinstance(t, BNode):
                if t not in rename:
                    rename[t] = BNode(f"{bnode_scope}{len(rename)}")
                return rename[t]
            return t
        for s, p, o in g:
            if not keep((s, p, o)):
                continue
            s, o = b(s), b(o)
            named.add((s, p, o))
            row = [self.node(s), self.node(p), self.lit(o) if isinstance(o, Literal) else self.node(o), fi]
            self.triples.append(row)
        for pfx, ns in g.namespaces():
            if pfx and not re.fullmatch(r"ns\d+", pfx) and pfx not in self.prefixes and str(ns) not in self.prefixes.values():
                self.prefixes[pfx] = str(ns)

    def to_json(self) -> dict:
        return {"nodes": self.nodes, "literals": self.lits, "files": self.files, "triples": self.triples}


def parse(path: Path) -> Graph:
    g = Graph(bind_namespaces="none")
    g.parse(str(path), format=semtool.guess_format(path))
    return g


def export_graph(repos, gx: GraphExport, warnings: list[str]) -> dict:
    """Governed RDF of every repository, then the FIBO profile modules and closure labels."""
    for repo in repos:
        for f in repo.all_rdf_files():
            try:
                gx.add_graph(parse(f), rel(f), bnode_scope=f"f{len(gx.files)}b")
            except Exception as e:  # noqa: BLE001
                warnings.append(f"could not parse {rel(f)}: {e}")
    fibo = {"modules": [], "available": False}
    fx = next((r for r in repos if r.kind == "fibo-extensions"), None)
    if fx is None:
        warnings.append("no fibo-extensions repository: FIBO modules not exported")
        return fibo
    profile = semtool.load(fx.files("profile"))
    modules = sorted(str(m) for s in profile.subjects(RDF.type, OWL.Ontology) for m in profile.objects(s, OWL.imports))
    catalog = semtool.catalog_map(fx)
    tag = fx.governance.cfg["fibo"]["release_tag"]
    for m in modules:
        path = catalog.get(m)
        rec = {"iri": m, "file": None, "url": None, "available": False}
        if path and Path(path).exists():
            try:
                g = parse(Path(path))
                gx.add_graph(g, rel(Path(path)), bnode_scope=f"f{len(gx.files)}b")
                inner = rel(Path(path)).split("vendor/fibo/", 1)[-1]
                rec.update(file=rel(Path(path)), available=True,
                           url=f"https://github.com/edmcouncil/fibo/blob/{tag}/{inner}")
            except Exception as e:  # noqa: BLE001
                warnings.append(f"could not parse FIBO module {m}: {e}")
        else:
            warnings.append(f"FIBO module not checked out: {m} (run `make fibo`)")
        fibo["modules"].append(rec)
    fibo["available"] = any(m["available"] for m in fibo["modules"])
    # labels, definitions and parents of the other FIBO/OMG terms domains build on, from their closures
    have = {gx.nodes[t[0]] for t in gx.triples if gx.nodes[t[1]] == str(RDFS.label)}
    keep_p = {RDFS.label, SKOS.definition, RDFS.subClassOf, RDF.type, RDFS.isDefinedBy}
    for closure in sorted(ROOT.glob("domains/*/*/build/closure.ttl")):
        try:
            c = Graph(bind_namespaces="none").parse(str(closure))
        except Exception as e:  # noqa: BLE001
            warnings.append(f"could not read {rel(closure)}: {e}")
            continue
        gx.add_graph(c, rel(closure), bnode_scope=f"f{len(gx.files)}b", keep=lambda t: (
            str(t[0]).startswith(semtool.EXTERNAL_PREFIXES) and str(t[0]) not in have and t[1] in keep_p
            and not isinstance(t[2], BNode)))
        have |= {str(s) for s in c.subjects(RDFS.label, None)}
    return fibo


# =============================================================================
# documents, cards, health
# =============================================================================

def tracked(pattern_suffixes: set[str]) -> list[Path]:
    listed = git("ls-files", "-co", "--exclude-standard")
    paths = [ROOT / p for p in listed.splitlines()] if listed else [p for p in ROOT.rglob("*") if p.is_file()]
    out = []
    for p in paths:
        if not p.is_file() or p.suffix not in pattern_suffixes:
            continue
        parts = set(p.relative_to(ROOT).parts)
        if parts & SKIP_PARTS or "template" in parts or p.name.endswith(".jinja"):
            continue
        out.append(p)
    return sorted(set(out))


def doc_group(path: str) -> str:
    if "/docs/adr/" in path:
        return "adr"
    if path.startswith("docs/framework/"):
        return "framework"
    if "/docs/standards/" in path:
        return "standards"
    if path.startswith("domains/"):
        return "domains"
    return "repository"


def export_docs() -> list[dict]:
    docs = []
    for p in tracked({".md"}):
        text = p.read_text(encoding="utf-8", errors="replace")
        r = rel(p)
        m = re.search(r"^#\s+(.+)$", text, re.M)
        status = re.search(r"^\s*[-*]?\s*\**Status\**\s*:\s*\**\s*([A-Za-z-]+)", text, re.M | re.I)
        docs.append({"path": r, "group": doc_group(r), "title": m.group(1).strip() if m else p.stem,
                     "status": status.group(1) if status and doc_group(r) == "adr" else None, "text": text})
    return docs


@contextlib.contextmanager
def quiet():
    with contextlib.redirect_stdout(io.StringIO()):
        yield


def export_cards(repos, warnings) -> dict:
    out = {}
    for repo in repos:
        if repo.kind != "domain":
            continue
        try:
            with quiet():
                semtool.cmd_cards(repo, argparse.Namespace())
            d = repo.root / "build" / "graphrag"
            cards = [json.loads(ln) for ln in (d / "cards.jsonl").read_text().splitlines() if ln.strip()]
            edges = [json.loads(ln) for ln in (d / "edges.jsonl").read_text().splitlines() if ln.strip()]
            out[rel(repo.root)] = {"cards": cards, "edges": edges}
        except Exception as e:  # noqa: BLE001
            warnings.append(f"cards for {rel(repo.root)}: {type(e).__name__}: {e}")
    return out


def live_drift(repo) -> dict:
    start = len(semtool._MESSAGES)
    t0 = now()
    try:
        with quiet():
            passed = bool(semtool.cmd_drift(repo, argparse.Namespace()))
    except Exception as e:  # noqa: BLE001
        semtool._record("fail", f"drift: {type(e).__name__}: {e}")
        passed = False
    return {"command": "drift", "repo": repo.root.name, "kind": repo.kind, "started": t0, "finished": now(),
            "commit": git("rev-parse", "HEAD") or None, "passed": passed, "live": True,
            "steps": [{"step": "drift", "gate": "G8", "passed": passed, "messages": semtool._MESSAGES[start:]}]}


def live_align(repo) -> dict:
    script = ROOT / "domains" / "domain-template" / "scripts" / "compare_domain.py"
    r = subprocess.run([sys.executable, str(script), str(repo.root)], capture_output=True, text=True)
    groups, current = {}, None
    for ln in r.stdout.splitlines():
        m = re.match(r"^(\S[\w-]*) \((\d+)\)$", ln)
        if m:
            current = m.group(1)
            groups[current] = []
        elif ln.startswith("  ") and current:
            groups[current].append(ln.strip())
    return {"passed": r.returncode == 0 and not groups.get("DRIFTED") and not groups.get("MISSING"),
            "groups": groups, "summary": (r.stdout.strip().splitlines() or [""])[-1],
            "error": r.stderr.strip()[-500:] if r.returncode not in (0, 1) else None}


def last_change(root: Path) -> float:
    """Newest modification time of the files a check reads (build output and nested repositories aside)."""
    newest = 0.0
    for p in root.rglob("*"):
        parts = set(p.relative_to(root).parts)
        if p.is_file() and not parts & SKIP_PARTS:
            newest = max(newest, p.stat().st_mtime)
    return newest


def is_stale(rep: dict, head: str | None, changed: float) -> bool:
    """A report is stale if it ran at another commit, or a file changed after it ran."""
    if head and rep.get("commit") and rep["commit"] != head:
        return True
    try:
        finished = datetime.datetime.strptime(rep.get("finished", ""), "%Y-%m-%dT%H:%M:%SZ") \
            .replace(tzinfo=datetime.timezone.utc).timestamp()
    except ValueError:
        return True
    return changed > finished + 1


def export_health(repos, skip_live: bool, warnings) -> dict:
    head = git("rev-parse", "HEAD") or None
    out = {"commit": head, "repos": {}, "selftest": None, "upstream_issues": []}
    gov = next((r for r in repos if r.kind == "governance"), None)
    fx = next((r for r in repos if r.kind == "fibo-extensions"), None)
    enterprise_change = max([last_change(r.root) for r in (gov, fx) if r] or [0.0])
    for repo in repos:
        reports = {}
        changed = max(last_change(repo.root), enterprise_change)   # every repository's checks read the enterprise layer
        for f in sorted((repo.root / "build" / "reports").glob("*.json")):
            try:
                rep = json.loads(f.read_text())
                rep["stale"] = is_stale(rep, head, changed)
                reports[f.stem] = rep
            except ValueError:
                warnings.append(f"unreadable report {rel(f)}")
        entry = {"reports": reports}
        if not skip_live:
            entry["drift"] = live_drift(repo)
            if repo.kind == "domain" and (repo.root / ".copier-answers.yml").exists():
                try:
                    entry["align"] = live_align(repo)
                except Exception as e:  # noqa: BLE001
                    warnings.append(f"align {rel(repo.root)}: {e}")
        out["repos"][rel(repo.root)] = entry
    st = ROOT / "build" / "reports" / "selftest.json"
    if st.exists():
        rep = json.loads(st.read_text())
        rep["stale"] = is_stale(rep, head, max(last_change(r.root) for r in repos))
        out["selftest"] = rep
    reg = fx.root / (fx.cfg.get("upstream_issues") or "profile/upstream-issues.yaml") if fx else None
    if reg and reg.exists():
        data = yaml.safe_load(reg.read_text()) or {}
        out["upstream_issues"] = data.get("issues") or []
        out["upstream_register"] = {k: v for k, v in data.items() if k != "issues"}
        out["upstream_register_path"] = rel(reg)
    return out


def public_remote(url: str) -> str | None:
    """The origin URL without any credentials (a CI checkout URL can carry a token)."""
    if not url:
        return None
    import urllib.parse
    parts = urllib.parse.urlsplit(url)
    if parts.scheme and "@" in parts.netloc:
        parts = parts._replace(netloc=parts.netloc.rsplit("@", 1)[1])
    return urllib.parse.urlunsplit(parts) if parts.scheme else url


def copy_sources(out: Path) -> int:
    n = 0
    for p in tracked(TEXT_SUFFIXES):
        if p.is_symlink():
            continue
        dest = out / "files" / rel(p)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, dest)
        n += 1
    return n


# =============================================================================

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "semantic-studio" / "build" / "site" / "data"))
    ap.add_argument("--skip-live", action="store_true", help="don't run drift and template alignment now")
    a = ap.parse_args()
    out = Path(a.out).resolve()
    if out.exists():
        if any(out.iterdir()) and not (out / "meta.json").exists():
            sys.exit(f"ERROR: {out} exists and is not a previous export (no meta.json); refusing to replace it")
        shutil.rmtree(out)
    out.mkdir(parents=True)
    warnings: list[str] = []

    repos = discover_repos()
    roles = {}
    for r in repos:
        roles.update(file_roles(r))
    gx = GraphExport()
    fibo = export_graph(repos, gx, warnings)
    (out / "graph.json").write_text(json.dumps(gx.to_json(), separators=(",", ":")))
    gx.dataset.serialize(str(out / "kg.trig"), format="trig")

    docs = export_docs()
    (out / "docs.json").write_text(json.dumps(docs, separators=(",", ":")))
    cards = export_cards(repos, warnings)
    (out / "cards.json").write_text(json.dumps(cards, separators=(",", ":")))
    health = export_health(repos, a.skip_live, warnings)
    (out / "health.json").write_text(json.dumps(health, separators=(",", ":"), default=str))
    n_src = copy_sources(out)

    gov = next(r for r in repos if r.kind == "governance")
    pin = git("ls-files", "-s", "fibo-extensions/vendor/fibo").split(" ")
    meta = {
        "generated": now(),
        "commit": git("rev-parse", "HEAD") or None,
        "commit_short": git("rev-parse", "--short", "HEAD") or None,
        "branch": git("rev-parse", "--abbrev-ref", "HEAD") or None,
        "dirty": bool(git("status", "--porcelain")),
        "remote": public_remote(git("config", "--get", "remote.origin.url")),
        "base_iri": gov.cfg["base_iri"],
        "enterprise": (gov.cfg.get("enterprise") or {}).get("name"),
        "fibo": {"release_tag": gov.cfg["fibo"]["release_tag"], "repository": gov.cfg["fibo"]["repository"],
                 "pin": pin[1] if len(pin) > 1 else None, **fibo},
        "prefixes": dict(sorted(gx.prefixes.items())),
        "graph_prefix": GRAPH_PREFIX,
        "repos": [repo_record(r, roles) for r in repos],
        "warnings": warnings,
        "counts": {"triples": len(gx.triples), "files": len(gx.files), "docs": len(docs), "sources": n_src},
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1, default=str))
    shown = rel(out) if out.is_relative_to(ROOT) else str(out)
    print(f"studio data: {len(gx.triples)} triples from {len(gx.files)} files, {len(docs)} documents, "
          f"{sum(len(c['cards']) for c in cards.values())} cards, {n_src} source files -> {shown}")
    for w in warnings:
        print(f"WARN {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
