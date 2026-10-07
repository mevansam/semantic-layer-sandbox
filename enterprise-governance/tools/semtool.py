#!/usr/bin/env python3
"""semtool - enterprise semantic layer tooling.

One tool, used by every repository (governance, fibo-extensions, domains) locally
and in CI. Each repository declares what it contains in its own `semantic.yaml`.

Commands
  syntax        parse every governed RDF file
  structure     check a domain repo against the domain repository structure standard
  taxonomy      generate the SKOS enterprise taxonomy from its markdown source
  capabilities  import a capability map (CSV/XLSX) into SKOS + domain register
  decisions     generate the decision register (standards/decision-register.ttl) from docs/adr/
  meta          validate governed assets against the enterprise meta-shapes
  extensions    enforce FIBO extension rules (no FIBO redefinition, namespaces, imports)
  closure       build the import closure (repo + enterprise + FIBO profile) as one file
  reason        classify the closure with ROBOT/ELK and fail on unsatisfiable classes
  rules         run domain business rules against positive and negative examples
  cq            run competency questions against the assembled knowledge graph
  kg            assemble the knowledge graph dataset (TriG, one named graph per partition)
  cards         export GraphRAG concept cards + edges from the knowledge graph
  codeowners    generate CODEOWNERS from the domain manifest
  drift         gate G8: facts repeated across files agree (registry, manifests, capability map,
                folders, versions, graph names, dependencies, alignment, generated files, FIBO pin)
  changes       compare with a git ref: version bumps match the change class (pull requests)
  rebase        replace the enterprise base IRI across repositories
  verify        run every check that applies to this repository kind

Usage: python semtool.py <command> [--repo PATH] [options]
"""
from __future__ import annotations

import argparse
import csv
import fnmatch
import glob
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml
from rdflib import BNode, ConjunctiveGraph, Dataset, Graph, Literal, Namespace, URIRef
from rdflib.namespace import DCTERMS, OWL, RDF, RDFS, SKOS, XSD

TOOL_DIR = Path(__file__).resolve().parent
GOV_ROOT = TOOL_DIR.parent

SH = Namespace("http://www.w3.org/ns/shacl#")
DCAT = Namespace("http://www.w3.org/ns/dcat#")
PROV = Namespace("http://www.w3.org/ns/prov#")
ODRL = Namespace("http://www.w3.org/ns/odrl/2/")
FIBO_AV = Namespace("https://spec.edmcouncil.org/fibo/ontology/FND/Utilities/AnnotationVocabulary/")
EXTERNAL_PREFIXES = ("https://spec.edmcouncil.org/", "https://www.omg.org/", "http://www.omg.org/")
DECLARATION_TYPES = {OWL.Class, OWL.ObjectProperty, OWL.DatatypeProperty, OWL.AnnotationProperty, OWL.Ontology}

RESET, RED, GREEN, YELLOW, BOLD = "\033[0m", "\033[31m", "\033[32m", "\033[33m", "\033[1m"
if not sys.stdout.isatty():
    RESET = RED = GREEN = YELLOW = BOLD = ""


# Every message is also recorded, so each run can leave a machine-readable report in
# build/reports/<command>.json (read by semantic-studio's Health page; see write_report).
_MESSAGES: list[dict] = []


def _record(level: str, msg) -> None:
    _MESSAGES.append({"level": level, "text": str(msg)})


def ok(msg): print(f"{GREEN}PASS{RESET} {msg}"); _record("pass", msg)
def warn(msg): print(f"{YELLOW}WARN{RESET} {msg}"); _record("warn", msg)
def fail(msg): print(f"{RED}FAIL{RESET} {msg}"); _record("fail", msg)
def info(msg): print(f"     {msg}"); _record("info", msg)


# =============================================================================
# Repository model
# =============================================================================

class Repo:
    def __init__(self, path: str | Path):
        self.root = Path(path).resolve()
        cfg_file = self.root / "semantic.yaml"
        if not cfg_file.exists():
            sys.exit(f"No semantic.yaml in {self.root}")
        self.cfg = yaml.safe_load(cfg_file.read_text())
        self.kind = self.cfg["repo_kind"]

    # -- related repositories -------------------------------------------------
    @property
    def governance(self) -> "Repo":
        if self.kind == "governance":
            return self
        return Repo(self.root / self.cfg["governance"])

    @property
    def fibo_extensions(self) -> "Repo | None":
        if self.kind == "fibo-extensions":
            return self
        p = self.cfg.get("fibo_extensions")
        return Repo(self.root / p) if p else None

    @property
    def dependencies(self) -> "list[Repo]":
        """Sibling sub-domains whose PUBLISHED modules this repo imports (domain kind), or the
        sub-domains a business-domain parent brings together (business-domain kind)."""
        key = "sub_domains" if self.kind == "business-domain" else "dependencies"
        return [Repo(self.root / p) for p in self.cfg.get(key, []) or []]

    @property
    def base_iri(self) -> str:
        return self.governance.cfg["base_iri"]

    # -- files ------------------------------------------------------------------
    def files(self, *keys: str) -> list[Path]:
        out: list[Path] = []
        paths = self.cfg.get("paths", {})
        for key in keys or paths.keys():
            for pattern in paths.get(key, []):
                out += sorted(Path(p) for p in glob.glob(str(self.root / pattern), recursive=True))
        return out

    def all_rdf_files(self) -> list[Path]:
        """RDF files of this repository only: nested repositories (a business domain's sub-domains)
        are skipped, they are checked on their own."""
        skip = {"vendor", "venv", ".venv", "build", ".git", "template", "node_modules"}
        nested = {p.parent for p in self.root.rglob("semantic.yaml")
                  if p.parent != self.root and not (set(p.relative_to(self.root).parts) & skip)}
        res = []
        for p in self.root.rglob("*"):
            if p.suffix in (".ttl", ".trig") and not (set(p.relative_to(self.root).parts) & skip) \
                    and not any(n in p.parents for n in nested):
                res.append(p)
        return sorted(res)


def load(paths, g: Graph | None = None) -> Graph:
    g = g if g is not None else Graph()
    for p in paths:
        g.parse(str(p), format=guess_format(p))
    return g


def guess_format(p) -> str:
    s = str(p)
    if s.endswith(".ttl"):
        return "turtle"
    if s.endswith(".trig"):
        return "trig"
    if s.endswith(".nt"):
        return "nt"
    return "xml"


def reference_view(g: Graph) -> Graph:
    """Copy of a reference graph without OWL declarations, so enterprise meta-model
    terms are available for typing (sh:class) but are not themselves validated as
    if they belonged to the repository under test."""
    out = Graph()
    for s, p, o in g:
        if p == RDF.type and o in DECLARATION_TYPES:
            continue
        out.add((s, p, o))
    return out


def governance_reference(repo: Repo) -> Graph:
    gov = repo.governance
    return load(gov.files("ontology", "reference", "assets"))


# =============================================================================
# syntax
# =============================================================================

def cmd_syntax(repo: Repo, args) -> bool:
    good = True
    files = repo.all_rdf_files()
    for f in files:
        try:
            Graph().parse(str(f), format=guess_format(f))
        except Exception as e:  # noqa: BLE001
            good = False
            fail(f"{f.relative_to(repo.root)}: {e}")
    if good:
        ok(f"syntax: {len(files)} RDF files parse cleanly")
    return good


# =============================================================================
# taxonomy  (markdown nested list -> SKOS)
# =============================================================================

PROPOSED = {"Client Personalized Planning & Advice", "Client Financial Wellness"}
REFERENCE_ONLY_PARENT = "Financials & Accounting"


def slug(text: str) -> str:
    text = text.replace("&", "and").replace("/", " ")
    text = re.sub(r"[()]", "", text)
    return re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()


def cmd_taxonomy(repo: Repo, args) -> bool:
    gov = repo.governance
    src = gov.root / "taxonomy/source/enterprise-taxonomy.md"
    out = gov.root / "taxonomy/enterprise-taxonomy.ttl"
    base = gov.base_iri + "taxonomy/"
    TAX = Namespace(base)
    AV = Namespace(gov.base_iri + "governance/annotations/")
    g = Graph()
    g.bind("ent-tax", TAX); g.bind("skos", SKOS); g.bind("ent-av", AV); g.bind("dct", DCTERMS)
    scheme = TAX["EnterpriseTaxonomy"]
    g.add((scheme, RDF.type, SKOS.ConceptScheme))
    g.add((scheme, SKOS.prefLabel, Literal("Enterprise Taxonomy", lang="en")))
    g.add((scheme, SKOS.definition, Literal(
        "Enterprise taxonomy of business subject areas. Generated from taxonomy/source/enterprise-taxonomy.md; "
        "do not edit by hand.", lang="en")))
    g.add((scheme, DCTERMS.source, Literal("example-enterprise-taxonomy.pdf")))

    stack: list[tuple[int, URIRef, str, str]] = []  # (indent, iri, slugpath, notation)
    counters: dict[str, int] = {}
    n = 0
    for line in src.read_text().splitlines():
        m = re.match(r"^(\s*)- (.+)$", line)
        if not m:
            continue
        indent = len(m.group(1)) // 2
        label = m.group(2).replace("**", "").strip()
        while stack and stack[-1][0] >= indent:
            stack.pop()
        parent = stack[-1] if stack else None
        path = (parent[2] + "." if parent else "") + slug(label)
        pkey = parent[3] if parent else "T"
        counters[pkey] = counters.get(pkey, 0) + 1
        notation = f"{pkey}.{counters[pkey]:02d}"
        iri = TAX[path]
        g.add((iri, RDF.type, SKOS.Concept))
        g.add((iri, SKOS.prefLabel, Literal(label, lang="en")))
        g.add((iri, SKOS.notation, Literal(notation)))
        g.add((iri, SKOS.inScheme, scheme))
        if parent:
            g.add((iri, SKOS.broader, parent[1]))
            g.add((parent[1], SKOS.narrower, iri))
        else:
            g.add((iri, SKOS.topConceptOf, scheme))
            g.add((scheme, SKOS.hasTopConcept, iri))
        status = "Active"
        if label in PROPOSED:
            status = "Proposed"
        elif parent and parent[1] == TAX[slug(REFERENCE_ONLY_PARENT)]:
            status = "ReferenceOnly"
        g.add((iri, AV.taxonomyStatus, Literal(status)))
        stack.append((indent, iri, path, notation))
        n += 1
    header = ("# GENERATED by tools/semtool.py taxonomy from taxonomy/source/enterprise-taxonomy.md\n"
              "# Owned by: Enterprise Governance. Change the source + re-run; do not hand-edit.\n")
    out.write_text(header + g.serialize(format="turtle"))
    ok(f"taxonomy: {n} concepts written to {out.relative_to(gov.root)}")
    return True


# =============================================================================
# capabilities  (capability map CSV/XLSX -> SKOS capabilities + domain register)
# =============================================================================

def read_table(path: Path) -> list[dict]:
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        hdr = [str(h).strip() if h is not None else "" for h in rows[0]]
        return [{hdr[i]: ("" if v is None else str(v).strip()) for i, v in enumerate(r)} for r in rows[1:] if any(r)]
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return [{k.strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(fh)]


ADR_FILE = re.compile(r"^(\d{4})-.+\.md$")


def cmd_decisions(repo: Repo, args) -> bool:
    """Generate the decision register (standards/decision-register.ttl) from the ADRs in docs/adr/ (ADR-0010)."""
    gov = repo.governance
    ADR = Namespace(gov.base_iri + "governance/decision/")
    GOV = Namespace(gov.base_iri + "governance/model/")
    g = Graph()
    g.bind("ent-adr", ADR); g.bind("ent-gov", GOV); g.bind("skos", SKOS); g.bind("dct", DCTERMS)
    problems = []
    n = 0
    for f in sorted((gov.root / "docs" / "adr").glob("*.md")):
        m = ADR_FILE.match(f.name)
        if not m or m.group(1) == "0000":
            continue
        text = f.read_text()
        num = m.group(1)
        title = re.search(r"^#\s+ADR-\d{4}:\s*(.+)$", text, re.M)
        field = lambda name: (re.search(rf"^\s*-\s*\*\*{name}:\*\*\s*(.+)$", text, re.M) or [None, None])[1]  # noqa: E731
        status_text = (field("Status") or "").strip()
        status = next((s for s in ("Superseded", "Accepted", "Proposed") if status_text.startswith(s)), None)
        if not title or not status:
            problems.append(f"{f.name}: needs a '# ADR-{num}: <title>' heading and a '- **Status:** Proposed|Accepted|Superseded by ADR-NNNN' line")
            continue
        d = ADR[f"ADR-{num}"]
        g.add((d, RDF.type, GOV.ArchitectureDecision))
        g.add((d, RDFS.label, Literal(title.group(1).strip(), lang="en")))
        g.add((d, SKOS.notation, Literal(f"ADR-{num}")))
        g.add((d, GOV.decisionStatus, Literal(status)))
        g.add((d, GOV.decisionRecord, Literal(f"{gov.root.name}/docs/adr/{f.name}")))
        date = (field("Date") or "").strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            g.add((d, DCTERMS.date, Literal(date, datatype=XSD.date)))
        for other in re.findall(r"ADR-(\d{4})", field("Supersedes") or ""):
            g.add((d, GOV.supersedesDecision, ADR[f"ADR-{other}"]))
        n += 1
    if problems:
        for p in problems:
            fail(f"decisions: {p}")
        return False
    out = gov.root / "standards" / "decision-register.ttl"
    header = ("# GENERATED by tools/semtool.py decisions from docs/adr/*.md - do not hand-edit.\n"
              "# Owned by: Enterprise Governance. Change the ADR + re-run (make decisions).\n")
    out.write_text(header + g.serialize(format="turtle"))
    ok(f"decisions: {n} decisions written to {out.relative_to(gov.root)}")
    return True


def cmd_capabilities(repo: Repo, args) -> bool:
    """Import the enterprise capability map, applying capabilities/curation.yaml (ADR-0004).

    Structure produced:  ontology domain (ent-gov:OntologyDomain)
                           > business domain (ent-gov:BusinessDomain, ent-gov:inOntologyDomain)
                           > capability tree (skos:Concept, ent-gov:accountableDomain)
    Only business-specific, correct mappings are kept; everything excluded is written to
    capabilities/data-quality-report.md with its reason.
    """
    gov = repo.governance
    cap_dir = gov.root / "capabilities"
    cols = yaml.safe_load((cap_dir / "columns.yaml").read_text())["columns"]
    cur = yaml.safe_load((cap_dir / "curation.yaml").read_text())
    src = Path(args.source) if args.source else next(
        (p for p in (cap_dir / "source/capability-map.csv", cap_dir / "source/capability-map.xlsx") if p.exists()), None)
    if not src:
        fail("capabilities: no source map in capabilities/source/")
        return False
    rows = read_table(src)
    need = [cols["domain"], cols["ontology_domain"], *cols["levels"]]
    missing = [c for c in need if rows and c not in rows[0]]
    if missing:
        fail(f"capabilities: columns {missing} not found in {src.name}; adjust capabilities/columns.yaml")
        return False

    base = gov.base_iri
    CAP, OD, DOM = Namespace(base + "capability/"), Namespace(base + "capability/ontology-domain/"), Namespace(base + "capability/domain/")
    GOV, AV, TAX = Namespace(base + "governance/model/"), Namespace(base + "governance/annotations/"), Namespace(base + "taxonomy/")
    tax = Graph().parse(str(gov.root / "taxonomy/enterprise-taxonomy.ttl"))

    norm = lambda s: re.sub(r"\s+", " ", s.strip()).lower()
    parse_path = lambda s: tuple(p.strip() for p in s.split(">"))
    tech_names = {norm(n) for n in cur.get("technology_capability_names", [])}
    aliases = {norm(d): [parse_path(p) for p in ps] for d, ps in (cur.get("anchor_aliases") or {}).items()}
    suspicious = {norm(d): why for d, why in (cur.get("suspicious_placements") or {}).items()}

    # ---- read source -----------------------------------------------------------------
    domains: dict[str, dict] = {}          # domain name -> {od, paths[]}
    nodes: set[tuple] = set()
    for r in rows:
        d, od = r[cols["domain"]].strip(), r[cols["ontology_domain"]].strip()
        path = tuple(v.strip() for v in (r[c] for c in cols["levels"]))
        path = tuple(v for v in path if v)
        info_ = domains.setdefault(d, {"od": od, "paths": []})
        if path:
            info_["paths"].append(path)
            for i in range(len(path)):
                nodes.add(path[:i + 1])

    def is_tech(path):
        return any(norm(p) in tech_names for p in path)

    # ---- rule 1: anchors ------------------------------------------------------------------
    anchors: dict[str, set] = {}
    excluded: dict[str, list] = {}
    for d, info_ in domains.items():
        for path in info_["paths"]:
            cand = [path[:i + 1] for i in range(len(path)) if norm(path[i]) == norm(d)]
            cand += [a for a in aliases.get(norm(d), []) if path[:len(a)] == a]
            cand = [c for c in cand if not is_tech(c)]
            if cand:
                anchors.setdefault(d, set()).add(max(cand, key=len))
            else:
                excluded.setdefault(d, []).append(path)
    # accountable domain per node = domain with the deepest anchor that is ancestor-or-self
    anchor_owner = {a: d for d, ans in anchors.items() for a in ans}
    def accountable(node):
        for i in range(len(node), 0, -1):
            if node[:i] in anchor_owner:
                return anchor_owner[node[:i]]
        return None
    # keep only nodes on or under an anchor (the curated, business-correct part of the map)
    kept = {n for n in nodes if accountable(n) and not is_tech(n)}
    kept |= {n[:i] for n in kept for i in range(1, len(n))}   # ancestors for hierarchy
    tech_kept = {n for n in nodes if is_tech(n) and any(n[:i] in kept for i in range(1, len(n)))}

    # ---- graph ---------------------------------------------------------------------------------
    g = Graph()
    for p, ns in (("ent-cap", CAP), ("ent-od", OD), ("ent-dom", DOM), ("ent-gov", GOV), ("ent-av", AV),
                  ("ent-tax", TAX), ("skos", SKOS), ("dct", DCTERMS)):
        g.bind(p, ns)
    scheme = CAP["CapabilityMap"]
    g.add((scheme, RDF.type, SKOS.ConceptScheme))
    g.add((scheme, SKOS.prefLabel, Literal("Enterprise Capability Map", lang="en")))
    g.add((scheme, DCTERMS.source, Literal(f"capabilities/source/{src.name}")))
    g.add((scheme, SKOS.editorialNote, Literal(
        "Curated import (ADR-0004): only business-specific mappings are included; see capabilities/data-quality-report.md.",
        lang="en")))

    cap_iri = lambda path: CAP[".".join(slug(p) for p in path)]
    od_iri = lambda name: OD[slug(name)]
    dom_iri = lambda d, od: DOM[(slug(od) + "/" if od else "unplaced/") + slug(d)]

    placements = {}
    for d, info_ in domains.items():
        od = None if norm(d) in suspicious else info_["od"]
        placements[d] = od
        di = dom_iri(d, od)
        g.add((di, RDF.type, GOV.BusinessDomain))
        g.add((di, RDFS.label, Literal(d, lang="en")))
        if od:
            g.add((od_iri(od), RDF.type, GOV.OntologyDomain))
            g.add((od_iri(od), RDFS.label, Literal(od, lang="en")))
            g.add((di, GOV.inOntologyDomain, od_iri(od)))
        else:
            g.add((di, SKOS.editorialNote, Literal(f"Ontology-domain placement '{info_['od']}' not imported: {suspicious[norm(d)]}.", lang="en")))
        for a in anchors.get(d, ()):
            g.add((di, GOV.realizesCapability, cap_iri(a)))

    # ---- rule 4: sub-domains (not in the source map) -------------------------------------------
    sub_iri: dict[str, URIRef] = {}
    for parent, subs in (cur.get("sub_domains") or {}).items():
        if parent not in domains:
            warn(f"capabilities: sub-domains declared for unknown domain '{parent}'")
            continue
        pi = dom_iri(parent, placements[parent])
        for sd in subs:
            si = URIRef(str(pi) + "/" + sd["slug"])
            g.add((si, RDF.type, GOV.SubDomain))
            g.add((si, RDFS.label, Literal(sd["name"], lang="en")))
            g.add((si, GOV.isSubDomainOf, pi))
            if placements[parent]:
                g.add((si, GOV.inOntologyDomain, od_iri(placements[parent])))
            if sd.get("note"):
                g.add((si, SKOS.editorialNote, Literal(sd["note"], lang="en")))
            sub_iri[f"{parent} > {sd['name']}"] = si

    def owner_iri(name):
        return sub_iri.get(name) or (dom_iri(name, placements[name]) if name in domains else None)

    def add_node(path, status="Authoritative", description=None, tech=False):
        c = cap_iri(path)
        g.add((c, RDF.type, SKOS.Concept))
        if tech:
            g.add((c, RDF.type, GOV.TechnologyCapability))
        g.add((c, SKOS.inScheme, scheme))
        g.add((c, SKOS.prefLabel, Literal(path[-1], lang="en")))
        g.add((c, SKOS.notation, Literal(" > ".join(path))))
        g.add((c, GOV.capabilityStatus, Literal(status)))
        if description:
            g.add((c, SKOS.definition, Literal(description, lang="en")))
        if len(path) > 1:
            g.add((c, SKOS.broader, cap_iri(path[:-1])))
        else:
            g.add((c, SKOS.topConceptOf, scheme))
        return c

    for n in sorted(kept):
        c = add_node(n)
        owner = accountable(n)
        if owner:
            g.add((c, GOV.accountableDomain, dom_iri(owner, placements[owner])))
    for n in sorted(tech_kept):
        add_node(n, tech=True)

    # ---- rule 4: proposed capabilities ------------------------------------------------------------
    proposed = []
    for pc in cur.get("proposed_capabilities") or []:
        path, d = parse_path(pc["path"]), pc["domain"]
        oi = owner_iri(d)
        if oi is None:
            warn(f"capabilities: proposed capability for unknown domain '{d}'")
            continue
        c = add_node(path, status="Proposed", description=pc.get("description"))
        g.add((c, SKOS.editorialNote, Literal("PROPOSED by the domain; not yet in the authoritative capability map.", lang="en")))
        g.add((c, GOV.accountableDomain, oi))
        g.add((oi, GOV.realizesCapability, c))
        proposed.append((d, pc["path"]))

    # ---- taxonomy crosswalk ------------------------------------------------------------------------
    errors = 0
    xw = cap_dir / "taxonomy-crosswalk.csv"
    if xw.exists():
        for r in read_table(xw):
            d = r["domain"]
            di = owner_iri(d)
            if di is None:
                warn(f"capabilities: crosswalk domain '{d}' not in capability map")
                errors += 1
                continue
            for a in filter(None, (x.strip() for x in r["taxonomy_anchors"].split(";"))):
                if (TAX[a], None, None) not in tax:
                    warn(f"capabilities: crosswalk {d}: taxonomy node '{a}' not found")
                    errors += 1
                    continue
                g.add((di, AV.governedBy, TAX[a]))

    out = cap_dir / "capability-map.ttl"
    out.write_text("# GENERATED by tools/semtool.py capabilities (curated per capabilities/curation.yaml). Do not hand-edit.\n"
                   + g.serialize(format="turtle"))

    # ---- data-quality report ---------------------------------------------------------------------------
    with_caps = {p[0].split(" > ")[0] for p in proposed}
    gaps = sorted(d for d in domains if not anchors.get(d) and d not in with_caps)
    lines = [
        "# Capability map: data-quality report (GENERATED)",
        "",
        f"Source: `capabilities/source/{src.name}` ({len(rows)} rows). Rules: `capabilities/curation.yaml` (ADR-0004).",
        "",
        "| | Count |", "|---|---|",
        f"| Ontology domains imported | {len({o for o in placements.values() if o})} |",
        f"| Business domains imported | {len(domains)} |",
        f"| Capability nodes in source | {len(nodes)} |",
        f"| Business capability nodes imported | {len(kept)} |",
        f"| Technology nodes (typed, not anchorable) | {len(tech_kept)} |",
        f"| Domain→capability mappings kept (anchors) | {sum(len(v) for v in anchors.values())} |",
        f"| Domain→capability rows excluded | {sum(len(v) for v in excluded.values())} |",
        f"| Proposed capabilities (not in source) | {len(proposed)} |",
        f"| Domains with no capability (gap) | {len(gaps)} |",
        "", "## Kept mappings (domain → anchor capability; accountable for its sub-tree)", "",
        "| Domain | Ontology domain | Anchor capability |", "|---|---|---|",
    ]
    for d in sorted(anchors):
        for a in sorted(anchors[d]):
            lines.append(f"| {d} | {placements[d] or '_unplaced_'} | {' > '.join(a)} |")
    lines += ["", "## Excluded mappings (copied capability trees that do not belong to the domain)", "",
              "| Domain | Rows excluded | Capability trees (L1) |", "|---|---|---|"]
    for d in sorted(excluded):
        l1 = sorted({p[0] for p in excluded[d]})
        lines.append(f"| {d} | {len(excluded[d])} | {', '.join(l1)} |")
    lines += ["", "## Ontology-domain placements not imported (suspicious)", "",
              "| Domain | Source placement | Reason |", "|---|---|---|"]
    for d, why in cur.get("suspicious_placements", {}).items():
        lines.append(f"| {d} | {domains.get(d, {}).get('od', '?')} | {why} |")
    lines += ["", "## Sub-domains (defined by the enterprise; the source map has none)", "",
              "| Business domain | Sub-domain | Note |", "|---|---|---|"]
    for parent, subs in (cur.get("sub_domains") or {}).items():
        for sd in subs:
            lines.append(f"| {parent} | {sd['name']} | {sd.get('note', '')} |")
    lines += ["", "## Proposed capabilities (to add to the authoritative map)", "", "| Domain | Capability |", "|---|---|"]
    lines += [f"| {d} | {p} |" for d, p in proposed]
    lines += ["", "## Capability gaps (domains with no business capability in the map)", ""]
    lines += [f"- {d} ({placements[d] or 'unplaced'})" for d in gaps]
    (cap_dir / "data-quality-report.md").write_text("\n".join(lines) + "\n")

    ok(f"capabilities: {len(domains)} domains in {len({o for o in placements.values() if o})} ontology domains, "
       f"{len(kept)} business capabilities kept, {sum(len(v) for v in excluded.values())} copied mappings excluded, "
       f"{len(proposed)} proposed -> capability-map.ttl + data-quality-report.md")
    return errors == 0


# =============================================================================
# structure  (domain repository structure standard)
# =============================================================================

def cmd_structure(repo: Repo, args) -> bool:
    """Check a domain repo against standards/domain-repo-structure.yaml (part of gate G1)."""
    if repo.kind != "domain":
        return True
    std = yaml.safe_load((repo.governance.root / "standards/domain-repo-structure.yaml").read_text())
    root, problems = repo.root, []

    for f in std["required_files"]:
        if not (root / f).is_file():
            problems.append(f"missing required file {f}")
    for folder, patterns in std["folders"].items():
        d = root / folder
        if not d.is_dir():
            if folder not in std.get("optional_folders", []):
                problems.append(f"missing folder {folder}/")
            continue
        for entry in sorted(p.name for p in d.iterdir() if p.name != ".DS_Store"):
            if not any(re.match(pt, entry) for pt in patterns):
                problems.append(f"{folder}/{entry} does not follow the naming standard ({' | '.join(patterns)})")
    folder_tops = {f.split("/")[0] for f in std["folders"]}
    for entry in sorted(p.name for p in root.iterdir() if p.name not in (".git", ".DS_Store")):
        if entry not in folder_tops and entry not in std["top_level"]:
            problems.append(f"unexpected top-level entry {entry}")

    # competency questions: numbering + id matches file name
    cq = std["competency_questions"]
    lo, hi = cq["template_owned"]
    for y in sorted((root / "competency-questions").glob("cq-*.yaml")):
        n = int(y.name[3:6])
        if not (lo <= n <= hi or n >= cq["domain_start"]):
            problems.append(f"{y.name}: domain-specific questions start at cq-{cq['domain_start']}")
        spec = yaml.safe_load(y.read_text())
        if spec.get("id") != f"CQ-{n:03d}":
            problems.append(f"{y.name}: id is {spec.get('id')}, expected CQ-{n:03d}")
        if not (y.parent / spec["query"]).is_file():
            problems.append(f"{y.name}: query file {spec['query']} not found")

    # execution models: files are named after the tool and every file belongs to a tool
    FAB = Namespace(repo.base_iri + "fabric/model/")
    em = load(repo.files("execution"))
    tools = {str(t): m for m, t in em.subject_objects(FAB.toolName)}
    for kind, sub, suffix, prop in (("query tool", "queries", ".rq", FAB.artifactPath),
                                    ("input schema", "schemas", ".schema.json", FAB.inputSchemaPath),
                                    ("rule pack", "rulepacks", ".yaml", FAB.artifactPath)):
        for f in sorted((root / "execution-models" / sub).glob("*" + suffix)):
            name = f.name[: -len(suffix)]
            if name not in tools:
                problems.append(f"execution-models/{sub}/{f.name}: no execution model with toolName '{name}'")
            elif str(em.value(tools[name], prop) or "") != f"execution-models/{sub}/{f.name}":
                problems.append(f"execution-models/{sub}/{f.name}: {prop.split('/')[-1]} of '{name}' does not point at it")
    for name, m in tools.items():
        for p in (em.value(m, FAB.artifactPath), em.value(m, FAB.inputSchemaPath)):
            if p and not (root / str(p)).exists():
                problems.append(f"execution model '{name}' points at missing file {p}")

    # negative tests: file number = rule number, and every rule has at least one negative case
    AV = Namespace(repo.base_iri + "governance/annotations/")
    rules = load(repo.files("rules"))
    rule_ids = {str(o) for o in rules.objects(None, AV.ruleIdentifier)}
    spec = yaml.safe_load((root / "tests/negative/expectations.yaml").read_text())
    covered = set()
    for case in spec.get("cases", []):
        covered |= set(case["expect_violations"])
        m = re.match(r"nc-(\d{3})-", case["file"])
        if m and not any(r.endswith(f"-R-{m.group(1)}") for r in case["expect_violations"]):
            problems.append(f"tests/negative/{case['file']}: nc-{m.group(1)} must test rule *-R-{m.group(1)}")
        if not (root / "tests/negative" / case["file"]).is_file():
            problems.append(f"tests/negative/expectations.yaml: {case['file']} not found")
    for rid in sorted(rule_ids - covered):
        problems.append(f"business rule {rid} has no negative test case")
    listed = {case["file"] for case in spec.get("cases", [])}
    for f in sorted((root / "tests/negative").glob("nc-*.ttl")):
        if f.name not in listed:
            problems.append(f"tests/negative/{f.name} is not listed in expectations.yaml (it would never run)")

    for p in problems:
        info(p)
    (fail if problems else ok)(f"structure: {len(problems)} deviation(s) from the domain repository standard"
                               if problems else "structure: conforms to the domain repository standard")
    return not problems


# =============================================================================
# meta  (enterprise meta-shapes)
# =============================================================================

def run_shacl(data: Graph, shapes: Graph, label: str, advanced=True, show=25) -> tuple[bool, Graph]:
    from pyshacl import validate
    conforms, report_g, _ = validate(data, shacl_graph=shapes, inference="none", advanced=advanced,
                                     allow_warnings=True, abort_on_first=False)
    results = list(report_g.subjects(RDF.type, SH.ValidationResult))
    viol = [r for r in results if report_g.value(r, SH.resultSeverity) == SH.Violation]
    warns = [r for r in results if report_g.value(r, SH.resultSeverity) == SH.Warning]
    for r in (viol + warns)[:show]:
        sev = "violation" if r in viol else "warning"
        focus = report_g.value(r, SH.focusNode)
        path = report_g.value(r, SH.resultPath)
        msg = report_g.value(r, SH.resultMessage)
        info(f"[{sev}] {short(focus)} {short(path) if path else ''}: {msg}")
    if viol:
        fail(f"{label}: {len(viol)} violation(s), {len(warns)} warning(s)")
    else:
        (ok if not warns else warn)(f"{label}: conforms" + (f" ({len(warns)} warning(s))" if warns else ""))
    return not viol, report_g


def short(n) -> str:
    s = str(n)
    for pref in ("https://ontology.example.com/", "https://spec.edmcouncil.org/fibo/ontology/"):
        s = s.replace(pref, "")
    return s


def meta_shapes(repo: Repo) -> Graph:
    gov = repo.governance
    names = ["meta-common.ttl", "meta-assets.ttl"]
    if repo.kind in ("domain", "fibo-extensions", "business-domain"):
        names.append("meta-business.ttl")
    return load([gov.root / "shapes" / n for n in names])


def local_governed_graph(repo: Repo) -> Graph:
    keys = [k for k in repo.cfg.get("paths", {}) if k not in ("reference", "shapes", "profile", "examples")]
    return load(repo.files(*keys))


def transitive_dependencies(repo: Repo) -> list[Repo]:
    seen: dict[Path, Repo] = {}
    todo = list(repo.dependencies)
    while todo:
        d = todo.pop()
        if d.root in seen or d.root == repo.root:
            continue
        seen[d.root] = d
        if d.kind == "domain":
            todo += d.dependencies
    return list(seen.values())


def cmd_meta(repo: Repo, args) -> bool:
    data = local_governed_graph(repo)
    ref = reference_view(governance_reference(repo))
    if repo.kind in ("domain", "business-domain") and repo.fibo_extensions:
        ref += reference_view(load(repo.fibo_extensions.files("ontology", "registry")))
    for dep in transitive_dependencies(repo):   # all the way down, so dependency cycles of any length are visible
        ref += reference_view(load(dep.files("ontology", "manifest")))
    data += ref
    good, _ = run_shacl(data, meta_shapes(repo), "meta-shapes")
    return good


# =============================================================================
# extensions  (FIBO extension rules)
# =============================================================================

def registry_graph(repo: Repo) -> Graph:
    fx = repo.fibo_extensions
    return load(fx.files("registry")) if fx else Graph()


def cmd_extensions(repo: Repo, args) -> bool:
    good = True
    files = [f for f in repo.all_rdf_files() if "tests" not in f.parts and "examples" not in f.parts]
    # Rule E1: never assert anything about FIBO / OMG terms (no redefinition, no annotation injection)
    for f in files:
        g = load([f])
        bad = {s for s in g.subjects() if isinstance(s, URIRef) and str(s).startswith(EXTERNAL_PREFIXES)}
        if bad:
            good = False
            fail(f"E1 {f.relative_to(repo.root)} makes statements about external (FIBO/OMG) terms: "
                 + ", ".join(sorted(short(b) for b in bad)[:5]))
    if good:
        ok("E1 no statements about FIBO/OMG terms (extend by subclassing only)")

    reg = registry_graph(repo)
    GOV = Namespace(repo.base_iri + "governance/model/")

    # Rule E2: every IRI minted by a domain lies in its registered namespace
    if repo.kind in ("domain", "business-domain"):
        ns = repo.cfg["domain"]["namespace"]
        registered = {str(o) for o in reg.objects(None, GOV.namespace)}
        if ns not in registered:
            good = False
            fail(f"E2 namespace {ns} is not registered in fibo-extensions/registry")
        else:
            ok(f"E2 namespace registered: {short(ns)}")
        minted = set()
        for f in files:
            g = load([f])
            for s in g.subjects():
                if isinstance(s, URIRef) and str(s).startswith(repo.base_iri) and (s, RDF.type, None) in g:
                    minted.add(str(s))
        stray = [m for m in minted if not m.startswith(ns)]
        if stray:
            good = False
            fail("E2 IRIs minted outside the domain namespace: " + ", ".join(sorted(short(s) for s in stray)[:8]))
        else:
            ok(f"E2 all {len(minted)} minted IRIs are inside the domain namespace")

    # Rule E3: owl:imports only of (a) enterprise ontologies, (b) FIBO modules in the enterprise profile,
    #          (c) other domains' modules the registry marks as published
    fx = repo.fibo_extensions
    profile = load(fx.files("profile")) if fx else Graph()
    allowed_fibo = {str(o) for o in profile.objects(None, OWL.imports)}
    published = {str(o) for o in reg.objects(None, GOV.publishedModule)}
    own_onts = set()
    for f in files:
        own_onts |= {str(s) for s in load([f]).subjects(RDF.type, OWL.Ontology)}
    for f in files:
        g = load([f])
        for imp in g.objects(None, OWL.imports):
            i = str(imp)
            if i in own_onts:
                continue
            if i.startswith(EXTERNAL_PREFIXES):
                if repo.kind == "fibo-extensions" and "profile" in f.parts:
                    continue  # the profile is where FIBO modules are adopted
                if i not in allowed_fibo:
                    good = False
                    fail(f"E3 {f.relative_to(repo.root)} imports FIBO module not in enterprise profile: {short(i)}")
            elif i.startswith(repo.base_iri + "ontology-domain/") and repo.kind in ("domain", "business-domain"):
                good = False
                fail(f"E3 {f.relative_to(repo.root)} imports an ontology-domain umbrella ({short(i)}); umbrellas are for consumers, domains never import them")
            elif i.startswith(repo.base_iri + "domain/") and repo.kind == "domain" and not i.startswith(repo.cfg["domain"]["namespace"]):
                if i not in published:
                    good = False
                    fail(f"E3 {f.relative_to(repo.root)} imports unpublished module of another domain: {short(i)}")
            elif i.startswith(repo.base_iri + "domain/") and repo.kind == "business-domain" and not i.startswith(repo.cfg["domain"]["namespace"]):
                good = False
                fail(f"E3 {f.relative_to(repo.root)}: a business-domain umbrella may import only its own sub-domains: {short(i)}")
    if good:
        ok("E3 imports respect the enterprise FIBO profile and published domain modules")
    return good


# =============================================================================
# closure + reason
# =============================================================================

def catalog_map(repo: Repo) -> dict[str, Path]:
    """IRI -> local file for enterprise ontologies (scanned) and FIBO/OMG (XML catalogs)."""
    m: dict[str, Path] = {}
    roots = [repo.governance]
    if repo.fibo_extensions:
        roots.append(repo.fibo_extensions)
    if repo not in roots:
        roots.append(repo)
    roots += repo.dependencies
    for r in roots:
        for f in r.all_rdf_files():
            try:
                g = Graph().parse(str(f), format=guess_format(f))
            except Exception:  # noqa: BLE001
                continue
            for s in g.subjects(RDF.type, OWL.Ontology):
                m[str(s)] = f
    fx = repo.fibo_extensions
    if fx:
        for cat in fx.cfg.get("catalogs", []):
            cpath = fx.root / cat
            if not cpath.exists():
                continue
            ns = {"c": "urn:oasis:names:tc:entity:xmlns:xml:catalog"}
            for u in ET.parse(cpath).getroot().findall("c:uri", ns):
                m.setdefault(u.get("name"), (cpath.parent / u.get("uri")).resolve())
    return m


def cmd_closure(repo: Repo, args) -> bool:
    cmap = catalog_map(repo)
    fx = repo.fibo_extensions
    roots: list[Path] = repo.files("ontology")
    if fx and repo.kind != "fibo-extensions":
        roots += fx.files("ontology")
    if fx:
        roots += fx.files("profile")
    merged = Graph()
    seen: set[str] = set()
    missing: dict[str, int] = {}
    queue: list[Path | str] = list(roots)
    loaded_files: set[Path] = set()
    while queue:
        item = queue.pop()
        if isinstance(item, str):
            if item in seen:
                continue
            seen.add(item)
            path = cmap.get(item) or cmap.get(item.rstrip("/")) or cmap.get(item + "/")
            if not path or not Path(path).exists():
                key = item.split("/spec/")[1].split("/")[0] if "/spec/" in item else item
                missing[key] = missing.get(key, 0) + 1
                continue
            item = Path(path)
        if item in loaded_files:
            continue
        loaded_files.add(item)
        g = Graph().parse(str(item), format=guess_format(item))
        for imp in g.objects(None, OWL.imports):
            queue.append(str(imp))
        for t in g:
            if t[1] != OWL.imports:
                merged.add(t)
    patched = apply_upstream_issues(repo, merged)
    out = repo.root / "build" / "closure.ttl"
    out.parent.mkdir(exist_ok=True)
    merged.serialize(str(out), format="turtle")
    ok(f"closure: {len(loaded_files)} ontology files, {len(merged)} triples -> {out.relative_to(repo.root)}"
       + (f" (known upstream defects patched out: {', '.join(patched)})" if patched else ""))
    if missing:
        warn("closure: unresolved imports skipped (FIBO's OMG Commons/LCC are missing: run `make omg` "
             "on a network that can reach omg.org): " + ", ".join(f"{k} x{v}" for k, v in sorted(missing.items())))
    (out.parent / "closure-unresolved.json").write_text(json.dumps(missing, indent=2))
    return True


def upstream_issues(repo: Repo) -> dict:
    fx = repo.fibo_extensions
    rel = fx.cfg.get("upstream_issues") if fx else None
    if not rel or not (fx.root / rel).exists():
        return {}
    return yaml.safe_load((fx.root / rel).read_text()) or {}


def apply_upstream_issues(repo: Repo, g: Graph) -> list[str]:
    """Remove the axioms of known FIBO/OMG defects from the build closure only (ADR-0007).
    FIBO stays read-only: vendor/ is never modified. Entries whose axiom is absent are reported as stale."""
    applied = []
    for issue in upstream_issues(repo).get("issues", []) or []:
        found = False
        for ax in issue.get("remove", []) or []:
            t = (URIRef(ax["subject"]), URIRef(ax["predicate"]), URIRef(ax["object"]))
            if t in g:
                g.remove(t)
                found = True
        if found:
            applied.append(issue["id"])
        else:
            warn(f"closure: upstream issue {issue['id']} ({issue.get('title', '')}) no longer applies - the axiom is not in "
                 "the closure (fixed upstream?). Re-validate and remove it from fibo-extensions/profile/upstream-issues.yaml")
    return applied


def robot_cmd() -> list[str]:
    """ROBOT_JAR (set by make), else the jar `make tools` downloads to build/tools/, else `robot` on the PATH."""
    jar = os.environ.get("ROBOT_JAR")
    if not jar:
        found = sorted((GOV_ROOT.parent / "build" / "tools").glob("robot-*.jar"))
        jar = str(found[-1]) if found else None
    if jar:
        return ["java", "-Xmx6g", "-jar", jar]
    return ["robot"]


def cmd_reason(repo: Repo, args) -> bool:
    closure = repo.root / "build" / "closure.ttl"
    if not closure.exists():
        cmd_closure(repo, args)
    out = repo.root / "build" / "reasoned.ttl"
    cmd = robot_cmd() + ["reason", "--reasoner", args.reasoner, "--input", str(closure),
                         "--equivalent-classes-allowed", "all", "--output", str(out)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        fail(f"reason ({args.reasoner}): '{cmd[0]}' not found - run `make tools` at the repository root "
             "(checks Java, downloads ROBOT to build/tools/), or export ROBOT_JAR=/path/to/robot.jar")
        return False
    log = [ln for ln in (r.stdout + r.stderr).splitlines() if ln.strip() and not ln.startswith("Picked up")]
    if r.returncode != 0:
        detail = [ln.split(" - ", 1)[-1].strip() for ln in log
                  if "unsatisfiable" in ln.lower() or "inconsistent" in ln.lower()]
        fail(f"reason ({args.reasoner}): " + (detail[0] if detail else (log[-1] if log else "error")))
        for d in detail[1:]:
            info(d)
        bad = re.findall(r"unsatisfiable (?:class|property): (\S+)", "\n".join(detail))
        if bad and all(b.startswith(EXTERNAL_PREFIXES) for b in bad):
            info("All unsatisfiable entities are FIBO/OMG terms: this is a defect in the pinned FIBO/OMG release, not in")
            info("this repository. Find the conflicting axioms (docs/framework/08-validation-tooling.md, troubleshooting),")
            info("then record the defect in fibo-extensions/profile/upstream-issues.yaml (ADR-0007).")
        elif bad:
            info("Unsatisfiable enterprise/domain terms: check their parents, restrictions, domains and ranges, and any")
            info("cross-sub-domain imports (an alignment question if two domains' axioms meet).")
        return False
    ok(f"reason ({args.reasoner}): closure is coherent, no unsatisfiable classes")
    return True


# =============================================================================
# rules  (domain business rules on examples)
# =============================================================================

def domain_context_graph(repo: Repo) -> Graph:
    """Ontology context used when validating instance data: domain ontology,
    enterprise core, and the class hierarchy of the closure if it has been built."""
    g = load(repo.files("ontology"))
    for dep in repo.dependencies:
        load(dep.files("ontology"), g)
    fx = repo.fibo_extensions
    if fx:
        load(fx.files("ontology"), g)
    closure = repo.root / "build" / "closure.ttl"
    if closure.exists():
        c = Graph().parse(str(closure))
        for t in c.triples((None, RDFS.subClassOf, None)):
            g.add(t)
    return g


def cmd_rules(repo: Repo, args) -> bool:
    shapes = load(repo.files("rules"))
    load(repo.governance.files("assets"), shapes)  # reusable shapes referenced via sh:node
    ctx = domain_context_graph(repo)
    good = True
    pos = [Path(p) for pat in repo.cfg.get("examples", {}).get("positive", []) for p in glob.glob(str(repo.root / pat))]
    if pos:
        data = load(pos) + ctx
        g, _ = run_shacl(data, shapes, f"rules on positive examples ({len(pos)} file(s))")
        good &= g
    neg_cfg = repo.cfg.get("examples", {}).get("negative")
    if neg_cfg:
        spec = yaml.safe_load((repo.root / neg_cfg).read_text())
        base_dir = (repo.root / neg_cfg).parent
        for case in spec["cases"]:
            data = load([base_dir / case["file"]]) + load(pos) + ctx
            from pyshacl import validate
            conforms, rep, _ = validate(data, shacl_graph=shapes, inference="none", advanced=True)
            fired = set()
            for r in rep.subjects(RDF.type, SH.ValidationResult):
                src = rep.value(r, SH.sourceShape)
                # map property shapes back to their node shape
                node = next(shapes.subjects(SH.property, src), src)
                rid = shapes.value(node, URIRef(repo.base_iri + "governance/annotations/ruleIdentifier"))
                if rid:
                    fired.add(str(rid))
            expected = set(case["expect_violations"])
            if expected <= fired:
                ok(f"negative case '{case['name']}': expected rule(s) {sorted(expected)} fired")
            else:
                good = False
                fail(f"negative case '{case['name']}': expected {sorted(expected)}, fired {sorted(fired)}")
    return good


# =============================================================================
# kg  (assemble named-graph dataset)
# =============================================================================

def graph_name(repo: Repo, publisher: str, collection: str, version: str, partition: str) -> URIRef:
    tmpl = repo.governance.cfg["graph_name_template"]
    return URIRef(tmpl.format(base=repo.base_iri, publisher=publisher, collection=collection,
                              version=version, partition=partition))


def collection_partitions(repo: Repo):
    """Yield (collection_iri, version, partition_iri, graph_name, files) from the repo's collections."""
    FAB = Namespace(repo.base_iri + "fabric/model/")
    cg = load(repo.files("collections"))
    for coll in cg.subjects(RDF.type, FAB.KnowledgeCollection):
        version = str(cg.value(coll, OWL.versionInfo))
        for part in cg.objects(coll, FAB.hasPartition):
            gname = cg.value(part, FAB.graphName)
            files = sorted({Path(p) for pattern in cg.objects(part, FAB.sourcePath)
                            for p in glob.glob(str(repo.root / str(pattern)))})
            yield coll, version, part, URIRef(str(gname)), files


def build_dataset(repo: Repo, include_examples=True) -> Dataset:
    ds = Dataset()
    ds.default_union = True
    gov = repo.governance
    ver = "v0.1.0"
    # enterprise graphs (always present in the KG)
    for part, keys in (("ontology", ("ontology",)), ("reference", ("reference",)), ("assets", ("assets",)), ("alignment", ("alignment",)),
                       ("decisions", ("decisions",))):
        g = ds.graph(graph_name(gov, "enterprise", "governance", ver, part))
        load(gov.files(*keys), g)
    fx = repo.fibo_extensions
    if fx:
        load(fx.files("ontology"), ds.graph(graph_name(fx, "enterprise", "fibo-extensions", ver, "ontology")))
        load(fx.files("registry"), ds.graph(graph_name(fx, "enterprise", "fibo-extensions", ver, "registry")))
        load(fx.files("profile"), ds.graph(graph_name(fx, "enterprise", "fibo-extensions", ver, "profile")))
        load(fx.files("umbrellas"), ds.graph(graph_name(fx, "enterprise", "fibo-extensions", ver, "ontology-domains")))
    if repo.kind == "domain":
        for coll, version, part, gname, files in collection_partitions(repo):
            load(files, ds.graph(gname))
        for dep in repo.dependencies:   # extension point: the published ontology of sub-domains we build on
            FAB = Namespace(repo.base_iri + "fabric/model/")
            dcg = load(dep.files("collections"))
            for coll, version, part, gname, files in collection_partitions(dep):
                if (part, FAB.partitionKind, FAB.OntologyPartition) in dcg:
                    load(files, ds.graph(gname))
        if include_examples:
            for r in [repo] + repo.dependencies:   # test fixtures: ours + those of sub-domains we build on
                pos = [Path(p) for pat in r.cfg.get("examples", {}).get("positive", []) for p in glob.glob(str(r.root / pat))]
                load(pos, ds.graph(URIRef(f"{r.base_iri}graph/{r.cfg['domain']['code']}/test/examples")))
    # optional: FIBO class labels/hierarchy used by the domain, from the closure
    closure = repo.root / "build" / "closure.ttl"
    if closure.exists() and repo.kind == "domain":
        c = Graph().parse(str(closure))
        fg = ds.graph(URIRef(repo.base_iri + "graph/fibo/" + gov.cfg["fibo"]["release_tag"] + "/profile-closure"))
        for s, p, o in c:
            if str(s).startswith(EXTERNAL_PREFIXES) and p in (RDFS.label, SKOS.definition, RDFS.subClassOf, RDF.type) \
                    and not isinstance(o, BNode):
                fg.add((s, p, o))
    return ds


def cmd_kg(repo: Repo, args) -> bool:
    ds = build_dataset(repo)
    out = repo.root / "build" / "kg.trig"
    out.parent.mkdir(exist_ok=True)
    ds.serialize(str(out), format="trig")
    names = [str(g.identifier) for g in ds.graphs() if len(g)]
    ok(f"kg: {len(names)} named graphs, {sum(len(g) for g in ds.graphs())} quads -> {out.relative_to(repo.root)}")
    for n in sorted(names):
        info(short(n))
    return True


# =============================================================================
# cq  (competency questions)
# =============================================================================

def cmd_cq(repo: Repo, args) -> bool:
    ds = build_dataset(repo)
    union = Graph()
    for g in ds.graphs():
        union += g
    good = True
    for f in sorted(glob.glob(str(repo.root / repo.cfg.get("competency_questions", "competency-questions/*.yaml")))):
        spec = yaml.safe_load(Path(f).read_text())
        q = (Path(f).parent / spec["query"]).read_text()
        for var, val in (spec.get("bindings") or {}).items():   # query tools: bind $inputs
            q = q.replace("$" + var, val)
        rows = [{str(k): str(v) for k, v in r.asdict().items()} for r in union.query(q)]
        exp = spec.get("expect", {})
        problems = []
        if len(rows) < exp.get("min_rows", 1):
            problems.append(f"expected >= {exp.get('min_rows', 1)} rows, got {len(rows)}")
        for var, val in (exp.get("contains") or {}).items():
            if not any(val in r.get(var, "") for r in rows):
                problems.append(f"no row with {var} ~ '{val}'")
        name = f"{spec['id']} {spec['question']}"
        if problems:
            good = False
            fail(f"cq {name}: " + "; ".join(problems))
        else:
            ok(f"cq {name} ({len(rows)} row(s))")
            if args.show:
                for r in rows[:args.show]:
                    info(", ".join(f"{k}={short(v)}" for k, v in r.items()))
    return good


# =============================================================================
# cards  (GraphRAG export)
# =============================================================================

CARD_QUERY = """
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?s ?label ?def WHERE {
  ?s rdfs:label|skos:prefLabel ?label .
  OPTIONAL { ?s skos:definition ?def }
}"""


def cmd_cards(repo: Repo, args) -> bool:
    """Concept cards: the unit of retrieval for GraphRAG (see fabric/graphrag/retrieval-contract.yaml)."""
    contract = yaml.safe_load((repo.governance.root / "fabric/graphrag/retrieval-contract.yaml").read_text())
    ds = build_dataset(repo, include_examples=False)
    AV = Namespace(repo.base_iri + "governance/annotations/")
    GOV = Namespace(repo.base_iri + "governance/model/")
    FAB = Namespace(repo.base_iri + "fabric/model/")
    union = Graph()
    graph_of: dict = {}
    for g in ds.graphs():
        for t in g:
            union.add(t)
            graph_of.setdefault(t[0], str(g.identifier))
    card_types = [URIRef(x.replace("{base}", repo.base_iri)) if x.startswith("{base}") else URIRef(expand(x))
                  for x in contract["card_types"]]
    scope = repo.cfg["domain"]["namespace"] if repo.kind == "domain" else repo.base_iri

    def lbl(x):
        v = union.value(x, RDFS.label) or union.value(x, SKOS.prefLabel)
        return str(v) if v else short(x)

    # collection lookup for provenance of each graph
    coll_of_graph = {}
    for coll in union.subjects(RDF.type, FAB.KnowledgeCollection):
        for part in union.objects(coll, FAB.hasPartition):
            coll_of_graph[str(union.value(part, FAB.graphName))] = coll

    cards, edges = [], []
    for s in set(union.subjects(RDF.type, None)):
        if not str(s).startswith(scope):
            continue
        types = set(union.objects(s, RDF.type))
        if not types & set(card_types):
            continue
        anchors = [union.value(a, SKOS.prefLabel) for a in union.objects(s, AV.governedBy)]
        parents = [x for x in union.objects(s, RDFS.subClassOf) if isinstance(x, URIRef)]
        lineage = [s] + [x for x in union.transitive_objects(s, RDFS.subClassOf) if x != s]
        rules = [r for c in lineage for r in union.subjects(SH.targetClass, c)]   # incl. inherited rules
        servers = list(union.subjects(GOV.servesConcept, s))
        apis = [a for a in servers if (a, RDF.type, GOV.DomainApi) in union]
        products = [d for d in servers if (d, RDF.type, DCAT.Dataset) in union]
        coll = coll_of_graph.get(graph_of.get(s, ""))
        card = {
            "id": str(s),
            "type": sorted(curie(t) for t in types),
            "label": lbl(s),
            "definition": str(union.value(s, SKOS.definition) or union.value(s, AV.ruleStatement) or ""),
            "agent_guidance": str(union.value(s, AV.agentGuidance) or ""),
            "rule_id": str(union.value(s, AV.ruleIdentifier) or ""),
            "taxonomy_anchors": [str(a) for a in anchors if a],
            "broader": [{"id": str(p), "label": lbl(p)} for p in parents],
            "governing_rules": [{"id": str(r), "rule_id": str(union.value(r, AV.ruleIdentifier) or ""),
                                 "statement": str(union.value(r, AV.ruleStatement) or "")} for r in rules],
            "served_by_apis": [{"id": str(a), "label": lbl(a)} for a in apis],
            "data_products": [{"id": str(d), "label": lbl(d),
                               "steward": str(union.value(union.value(d, GOV.hasDataSteward), GOV.heldBy) or "")}
                              for d in products],
            "citation": {
                "graph": graph_of.get(s, ""),
                "collection": str(coll) if coll else "",
                "collection_version": str(union.value(coll, OWL.versionInfo)) if coll else "",
                "sensitivity": short(union.value(coll, FAB.sensitivity)) if coll else "",
            },
        }
        card["text"] = render_card_text(card)
        cards.append(card)
        for p, o in union.predicate_objects(s):
            if isinstance(o, URIRef) and p != RDF.type and short(p) in contract["edge_predicates"]:
                edges.append({"source": str(s), "predicate": short(p), "target": str(o)})
    out = repo.root / "build" / "graphrag"
    out.mkdir(parents=True, exist_ok=True)
    (out / "cards.jsonl").write_text("\n".join(json.dumps(c) for c in sorted(cards, key=lambda c: c["id"])) + "\n")
    (out / "edges.jsonl").write_text("\n".join(json.dumps(e) for e in edges) + "\n")
    ok(f"cards: {len(cards)} concept cards, {len(edges)} edges -> build/graphrag/")
    return bool(cards)


def curie(n) -> str:
    for p, ns in PREFIXES.items():
        if str(n).startswith(ns):
            return f"{p}:{str(n)[len(ns):]}"
    return short(n)


def render_card_text(c: dict) -> str:
    lines = [f"{c['label']} ({', '.join(c['type'])})", c["definition"]]
    if c["taxonomy_anchors"]:
        lines.append("Taxonomy: " + "; ".join(c["taxonomy_anchors"]))
    if c["broader"]:
        lines.append("Kind of: " + "; ".join(b["label"] for b in c["broader"]))
    for r in c["governing_rules"]:
        lines.append(f"Rule {r['rule_id']}: {r['statement']}")
    if c["served_by_apis"]:
        lines.append("Served by APIs: " + "; ".join(a["label"] for a in c["served_by_apis"]))
    if c["data_products"]:
        lines.append("Data products: " + "; ".join(f"{d['label']} (steward: {d['steward']})" for d in c["data_products"]))
    if c["agent_guidance"]:
        lines.append("Agent guidance: " + c["agent_guidance"])
    return "\n".join(x for x in lines if x)


PREFIXES = {
    "owl": str(OWL), "rdfs": str(RDFS), "skos": str(SKOS), "sh": str(SH), "dcat": str(DCAT),
}


def expand(curie: str) -> str:
    p, _, local = curie.partition(":")
    return PREFIXES[p] + local


# =============================================================================
# codeowners
# =============================================================================

def cmd_codeowners(repo: Repo, args) -> bool:
    if repo.kind != "domain":
        warn("codeowners: only generated for domain repositories")
        return True
    (repo.root / "CODEOWNERS").write_text(codeowners_text(repo))
    ok("codeowners: CODEOWNERS generated from domain manifest")
    return True


# =============================================================================
# drift  (gate G8 - consistency: a fact stated in more than one place must agree)
# =============================================================================
#
# Most facts are stated once. The few that are necessarily repeated (for tools,
# for reasoning, for the knowledge graph) are listed in
# docs/framework/07-change-management.md and checked here:
#   D1 versions      owl:versionIRI = {ontology IRI}{owl:versionInfo}/ for every module
#   D2 identity      folder = namespace = registry = manifest = capability map = template answers
#   D3 modules       manifest ent-gov:hasOntologyModule = ontology/*.ttl; published modules exist
#   D4 dependencies  semantic.yaml dependencies = manifest dependsOnSubDomain = domain imports
#   D5 collections   graph names carry the publisher code, collection and collection version
#   D6 parent layer  sub_domains = folders = includesSubDomain = capability map = umbrella imports
#   D7 registry      every registered (non-reserved) domain exists; published modules exist
#   D8 alignment     alignment register and enterprise core refer only to terms and domains that exist
#   D9 generated     taxonomy, capability map, data-quality report, decision register and CODEOWNERS match their sources
#   D10 FIBO pin     .gitmodules / submodule checkout = fibo.release_tag in semantic.yaml
#   D11 rule links   every targeted meta-shape names a standard that exists and a decision; accepted decisions are cited

def markdown_anchors(text: str) -> set[str]:
    """GitHub-style heading anchors of a markdown document (outside code blocks)."""
    anchors, seen, fence = set(), {}, False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fence = not fence
            continue
        m = None if fence else re.match(r"^#{1,6}\s+(.+?)\s*#*\s*$", line)
        if not m:
            continue
        heading = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", m.group(1))
        slug = re.sub(r"[^\w\s-]", "", heading.lower().strip(), flags=re.UNICODE).replace(" ", "-")
        k = seen.get(slug, 0)
        seen[slug] = k + 1
        anchors.add(slug if k == 0 else f"{slug}-{k}")
    return anchors


def monorepo_root(repo: Repo) -> Path:
    return repo.governance.root.parent


def ontology_headers(files) -> dict:
    out = {}
    for f in files:
        g = load([f])
        for o in g.subjects(RDF.type, OWL.Ontology):
            out[str(o)] = {"file": f, "version": g.value(o, OWL.versionInfo), "versionIRI": g.value(o, OWL.versionIRI),
                           "maturity": g.value(o, FIBO_AV.hasMaturityLevel), "imports": {str(i) for i in g.objects(o, OWL.imports)}}
    return out


def governed_rdf_files(repo: Repo) -> list[Path]:
    return [f for f in repo.all_rdf_files() if not {"tests", "examples"} & set(f.relative_to(repo.root).parts)]


def registry_entry(reg: Graph, GOV, namespace: str):
    return next((s for s, o in reg.subject_objects(GOV.namespace) if str(o) == namespace), None)


def domain_manifest(repo: Repo, GOV):
    """(graph, manifest node) of a sub-domain (domain-manifest.ttl) or business domain (domain.ttl)."""
    if repo.kind == "domain":
        g = load(repo.files("manifest"))
        return g, next(g.subjects(RDF.type, GOV.DomainManifest), None)
    g = load(repo.files("ontology"))
    return g, next(g.subjects(RDF.type, GOV.ParentDomainManifest), None)


def codeowners_text(repo: Repo) -> str:
    GOV = Namespace(repo.base_iri + "governance/model/")
    m = load(repo.files("manifest"))
    teams = repo.governance.cfg["enterprise"]["teams"]

    def team(prop):
        return sorted({str(m.value(r, GOV.reviewTeam)) for r in m.objects(None, prop)})

    owner, rule, api, stew, rec = (team(GOV.hasDomainOwner), team(GOV.hasRuleOwner), team(GOV.hasApiOwner),
                                   team(GOV.hasDataSteward), team(GOV.hasRecordsOwner))
    rev, risk, fab = teams["semantic_review"], teams["ai_risk"], teams["fabric"]
    lines = [
        "# GENERATED from domain-manifest.ttl by semtool codeowners - do not edit by hand.",
        "# Two-key review: the domain approves MEANING; the enterprise approves REPRESENTATION.",
        f"*                      {' '.join(owner)} {rev}",
        f"/ontology/             {' '.join(owner)} {rev}",
        f"/rules/                {' '.join(rule)} {rev}",
        f"/processes/            {' '.join(owner)} {rev}",
        f"/apis/                 {' '.join(api)} {rev}",
        f"/stewardship/          {' '.join(stew)} {rev}",
        f"/records/              {' '.join(rec)} {rev}",
        f"/collections/          {' '.join(owner)} {fab} {risk}",
        f"/execution-models/     {' '.join(owner)} {fab} {risk}",
        f"/domain-manifest.ttl   {' '.join(owner)} {rev}",
        f"/semantic.yaml         {' '.join(owner)} {rev}",
    ]
    return "\n".join(lines) + "\n"


def cmd_drift(repo: Repo, args) -> bool:
    problems: list[str] = []
    notes: list[str] = []

    def check(cond, code, msg):
        if not cond:
            problems.append(f"{code} {msg}")
        return cond

    base = repo.base_iri
    GOV = Namespace(base + "governance/model/")
    FAB = Namespace(base + "fabric/model/")
    gov = repo.governance
    root = monorepo_root(repo)
    reg = registry_graph(repo) if repo.kind != "governance" else Graph()
    rel = lambda p: str(Path(p).relative_to(repo.root))  # noqa: E731

    # ---- D1 versions --------------------------------------------------------------------
    headers = ontology_headers(governed_rdf_files(repo))
    for iri, h in headers.items():
        if iri.startswith(EXTERNAL_PREFIXES) or h["version"] is None:
            continue
        expected = iri.rstrip("/") + "/" + str(h["version"]) + "/"
        check(h["versionIRI"] is not None and str(h["versionIRI"]) == expected, "D1",
              f"{rel(h['file'])}: owl:versionIRI {h['versionIRI']} does not match owl:versionInfo \"{h['version']}\" (expected {expected})")

    # ---- sub-domains and business domains ---------------------------------------------------
    if repo.kind in ("domain", "business-domain"):
        d = repo.cfg["domain"]
        ns, code = d["namespace"], d["code"]
        cap = load(gov.files("reference"))
        # D2 identity: folder <-> namespace <-> registry <-> manifest <-> capability map
        try:
            path = repo.root.relative_to(root / "domains").as_posix()
        except ValueError:
            path = None
        if path is not None:
            check(ns == f"{base}domain/{path}/", "D2", f"semantic.yaml namespace {ns} does not follow the folder (expected {base}domain/{path}/, ADR-0005)")
        entry = registry_entry(reg, GOV, ns)
        describes = None
        if check(entry is not None, "D2", f"namespace {ns} is not registered in fibo-extensions/registry"):
            check(str(reg.value(entry, GOV.domainCode)) == code, "D2",
                  f"semantic.yaml code '{code}' differs from registry domainCode '{reg.value(entry, GOV.domainCode)}'")
            check(str(reg.value(entry, GOV.registrationStatus)) != "Reserved", "D2",
                  "registry status is still 'Reserved' but the domain has a repository (set it to 'Provisional')")
            repo_url = reg.value(entry, GOV.codeRepository)
            if repo_url is not None and "/tree/" in str(repo_url) and path is not None:
                check(str(repo_url).endswith("/domains/" + path), "D2", f"registry codeRepository {repo_url} does not point at domains/{path}")
            describes = reg.value(entry, GOV.registersDomain)
        mg, manifest = domain_manifest(repo, GOV)
        if check(manifest is not None, "D2", "no domain manifest found"):
            check(str(mg.value(manifest, GOV.namespace)) == ns, "D2",
                  f"manifest namespace {mg.value(manifest, GOV.namespace)} differs from semantic.yaml {ns}")
            if describes is not None:
                check(mg.value(manifest, GOV.describesDomain) == describes, "D2",
                      f"manifest describes {mg.value(manifest, GOV.describesDomain)} but the registry registers {describes}")
            describes = describes or mg.value(manifest, GOV.describesDomain)
        if describes is not None:
            kind = GOV.SubDomain if repo.kind == "domain" else GOV.BusinessDomain
            if check((describes, RDF.type, kind) in cap, "D2", f"{describes} is not a {short(kind)} in the capability map"):
                label = cap.value(describes, RDFS.label)
                check(label is None or str(label) == d["name"], "D2", f"semantic.yaml name '{d['name']}' differs from capability map label '{label}'")
        if repo.kind == "domain":
            if describes is not None and (repo.root.parent / "semantic.yaml").exists():
                parent = Repo(repo.root.parent)
                check(cap.value(describes, GOV.isSubDomainOf) is not None and
                      str(cap.value(describes, GOV.isSubDomainOf)) == str(reg.value(registry_entry(reg, GOV, parent.cfg["domain"]["namespace"]), GOV.registersDomain)),
                      "D2", f"capability map places {short(describes)} under {cap.value(describes, GOV.isSubDomainOf)}, not under this folder's business domain")
            answers_file = repo.root / ".copier-answers.yml"
            if answers_file.exists():
                a = yaml.safe_load(answers_file.read_text()) or {}
                for key, want in (("registry_code", code), ("namespace_path", path), ("domain_name", d["name"]),
                                  ("base_iri", base), ("capability_domain_iri", str(describes) if describes is not None else None)):
                    if key in a and want is not None:
                        check(str(a[key]) == str(want), "D2", f".copier-answers.yml {key} '{a[key]}' differs from the repository ('{want}')")
            # D3 modules
            onts = ontology_headers(repo.files("ontology"))
            if manifest is not None:
                declared = {str(o) for o in mg.objects(manifest, GOV.hasOntologyModule)}
                check(declared == set(onts), "D3", f"manifest hasOntologyModule {sorted(short(x) for x in declared)} "
                      f"differs from the modules in ontology/ {sorted(short(x) for x in onts)}")
            for iri in onts:
                check(iri.startswith(ns), "D3", f"ontology module {iri} is outside the namespace {ns}")
            if entry is not None:
                for pm in reg.objects(entry, GOV.publishedModule):
                    check(str(pm) in onts, "D3", f"registry publishes {pm}, which is not a module in ontology/")
            # D4 dependencies
            deps = repo.dependencies
            dep_domains, dep_ns = set(), {}
            for dep in deps:
                check(dep.root.parent == repo.root.parent, "D4", f"dependency {dep.root.name} is not a sibling sub-domain (ADR-0005)")
                dg, dm = domain_manifest(dep, GOV)
                if dm is not None:
                    dep_domains.add(str(dg.value(dm, GOV.describesDomain)))
                dep_ns[dep.cfg["domain"]["namespace"]] = dep.root.name
            if manifest is not None:
                declared = {str(o) for o in mg.objects(manifest, GOV.dependsOnSubDomain)}
                check(declared == dep_domains, "D4", f"manifest dependsOnSubDomain {sorted(short(x) for x in declared)} "
                      f"differs from semantic.yaml dependencies {sorted(short(x) for x in dep_domains)}")
            used = set()
            for iri, h in onts.items():
                for imp in h["imports"]:
                    if imp.startswith(base + "domain/") and not imp.startswith(ns):
                        owner = next((n for n in dep_ns if imp.startswith(n)), None)
                        if check(owner is not None, "D4", f"{rel(h['file'])} imports {imp} from a sub-domain not listed in semantic.yaml dependencies"):
                            used.add(owner)
            for n, name in dep_ns.items():
                check(n in used, "D4", f"dependency {name} is declared but none of its modules is imported (stale dependency)")
            # D5 collections
            for coll, version, part, gname, files in collection_partitions(repo):
                prefix = f"{base}graph/{code}/{repo.root.name}/v{version}/"
                check(str(gname).startswith(prefix), "D5", f"graph name {gname} does not start with {prefix} (publisher code / collection / collection version)")
                check(bool(files), "D5", f"partition {str(gname).rsplit('/', 1)[-1]} matches no files (sourcePath)")
            cgraph = load(repo.files("collections"))
            for coll in cgraph.subjects(RDF.type, FAB.KnowledgeCollection):
                if describes is not None:
                    check(cgraph.value(coll, FAB.publishedBy) == describes, "D5", f"collection {short(coll)} is published by {cgraph.value(coll, FAB.publishedBy)}, not by this sub-domain")
        else:
            # D6 parent layer
            listed = set(repo.cfg.get("sub_domains") or [])
            actual = {p.name for p in repo.root.iterdir() if (p / "semantic.yaml").exists()}
            check(listed == actual, "D6", f"semantic.yaml sub_domains {sorted(listed)} differs from the sub-domain folders {sorted(actual)}")
            sub_domains, published = set(), set()
            for sd in repo.dependencies:
                sg, sm = domain_manifest(sd, GOV)
                if sm is not None:
                    sub_domains.add(str(sg.value(sm, GOV.describesDomain)))
                e = registry_entry(reg, GOV, sd.cfg["domain"]["namespace"])
                if e is not None:
                    published |= {str(o) for o in reg.objects(e, GOV.publishedModule)}
            if manifest is not None:
                included = {str(o) for o in mg.objects(manifest, GOV.includesSubDomain)}
                check(included == sub_domains, "D6", f"includesSubDomain {sorted(short(x) for x in included)} differs from the sub-domain manifests {sorted(short(x) for x in sub_domains)}")
            if describes is not None:
                in_map = {str(s) for s in cap.subjects(GOV.isSubDomainOf, describes)}
                check(in_map == sub_domains, "D6", f"capability map sub-domains {sorted(short(x) for x in in_map)} differ from the sub-domain folders {sorted(short(x) for x in sub_domains)} (capabilities/curation.yaml sub_domains)")
            umbrella = ontology_headers(repo.files("ontology")).get(ns)
            if check(umbrella is not None, "D6", f"domain.ttl does not declare the umbrella ontology {ns}"):
                check(umbrella["imports"] == published, "D6", f"umbrella imports {sorted(short(x) for x in umbrella['imports'])} differ from the sub-domains' published modules {sorted(short(x) for x in published)}")
            od = cap.value(describes, GOV.inOntologyDomain) if describes is not None else None
            if od is not None and repo.fibo_extensions:
                slug_ = str(od).rstrip("/").rsplit("/", 1)[-1]
                f = repo.fibo_extensions.root / "ontology" / "ontology-domains" / f"{slug_}.ttl"
                if check(f.exists(), "D6", f"no ontology-domain umbrella fibo-extensions/ontology/ontology-domains/{slug_}.ttl"):
                    oh = ontology_headers([f]).get(f"{base}ontology-domain/{slug_}/")
                    check(oh is not None and ns in oh["imports"], "D6", f"ontology-domain umbrella {slug_}.ttl does not import {ns}")

    # ---- fibo-extensions: registry and umbrellas -------------------------------------------
    if repo.kind == "fibo-extensions":
        codes, spaces = {}, {}
        for e in reg.subjects(RDF.type, GOV.DomainRegistration):
            code, ns = str(reg.value(e, GOV.domainCode)), str(reg.value(e, GOV.namespace))
            check(code not in codes, "D7", f"domain code '{code}' registered twice ({short(codes.get(code))}, {short(e)})")
            check(ns not in spaces, "D7", f"namespace {ns} registered twice")
            codes[code], spaces[ns] = e, e
            if str(reg.value(e, GOV.registrationStatus)) == "Reserved":
                continue
            folder = root / "domains" / ns[len(base + "domain/"):].strip("/")
            if check((folder / "semantic.yaml").exists(), "D7", f"{short(e)} is registered (not Reserved) but domains/{folder.relative_to(root / 'domains')} does not exist"):
                r = Repo(folder)
                check(r.cfg["domain"]["namespace"] == ns, "D7", f"domains/{folder.name}/semantic.yaml namespace differs from registry {ns}")
                modules = ontology_headers(r.files("ontology"))
                for pm in reg.objects(e, GOV.publishedModule):
                    check(str(pm) in modules, "D7", f"{short(e)} publishes {pm}, which no module in {folder.relative_to(root)} declares")
        for f in repo.files("umbrellas"):
            for iri, h in ontology_headers([f]).items():
                check(iri == f"{base}ontology-domain/{f.stem}/", "D7", f"{rel(f)}: umbrella IRI {iri} does not match its file name")
                for imp in h["imports"]:
                    if imp.startswith(base + "domain/"):
                        e = registry_entry(reg, GOV, imp)
                        check(e is not None, "D7", f"{rel(f)} imports {imp}, which is not a registered business-domain namespace")

    # ---- governance: alignment, curation, generated files, FIBO pin ----------------------------
    if repo.kind == "governance":
        fx_dir = root / "fibo-extensions"
        declared = set()
        roots = [fx_dir] + [p.parent for p in (root / "domains").glob("*/*/semantic.yaml")] + [p.parent for p in (root / "domains").glob("*/semantic.yaml")]
        for r in roots:
            for f in Path(r).rglob("*.ttl"):
                if {"vendor", "build", "tests", "examples", "template", "parent-template"} & set(f.relative_to(r).parts):
                    continue
                g = load([f])
                declared |= {str(s) for s in g.subjects(RDF.type, None) if isinstance(s, URIRef)}
        cap = load(gov.files("reference"))
        domains_known = {str(s) for s in cap.subjects(RDF.type, GOV.BusinessDomain)} | {str(s) for s in cap.subjects(RDF.type, GOV.SubDomain)}
        aln = load(gov.files("alignment"))
        for dcn in aln.subjects(RDF.type, GOV.AlignmentDecision):
            for t in aln.objects(dcn, GOV.alignsTerm):
                check(str(t) in declared, "D8", f"{short(dcn)} aligns {t}, which no domain or enterprise-core module declares (renamed or removed?)")
            for dm in aln.objects(dcn, GOV.consultedDomain):
                check(str(dm) in domains_known, "D8", f"{short(dcn)} consults {dm}, which is not a domain in the capability map")
        AV = Namespace(base + "governance/annotations/")
        fx_reg = load((fx_dir / "registry").glob("*.ttl")) if fx_dir.exists() else Graph()
        registered_domains = {str(o) for o in fx_reg.objects(None, GOV.registersDomain)}
        core = load((fx_dir / "ontology" / "core").glob("*.ttl")) if fx_dir.exists() else Graph()
        for s, o in core.subject_objects(AV.owningDomain):
            check(str(o) in registered_domains, "D8", f"enterprise-core {short(s)} names owning domain {o}, which is not registered")
        # curation sub_domains <-> business-domain folders
        curation = yaml.safe_load((gov.root / "capabilities" / "curation.yaml").read_text()) or {}
        cur = {k: {x["slug"] for x in v} for k, v in (curation.get("sub_domains") or {}).items()}
        for p in sorted((root / "domains").glob("*/semantic.yaml")):
            bd = Repo(p.parent)
            if bd.kind != "business-domain":
                continue
            name = bd.cfg["domain"]["name"]
            check(cur.get(name, set()) == set(bd.cfg.get("sub_domains") or []), "D9",
                  f"capabilities/curation.yaml sub_domains for '{name}' {sorted(cur.get(name, set()))} differ from domains/{p.parent.name} {sorted(bd.cfg.get('sub_domains') or [])}")
        # D9 generated files are current
        import contextlib, io, shutil, tempfile  # noqa: E401
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / gov.root.name
            shutil.copytree(gov.root, copy, ignore=shutil.ignore_patterns(".git", "build", "__pycache__"))
            with contextlib.redirect_stdout(io.StringIO()):
                ns_args = argparse.Namespace(source=None)
                cmd_taxonomy(Repo(copy), ns_args)
                cmd_capabilities(Repo(copy), ns_args)
                cmd_decisions(Repo(copy), ns_args)
            for relp, cmd in (("taxonomy/enterprise-taxonomy.ttl", "taxonomy"), ("capabilities/capability-map.ttl", "capabilities"),
                              ("capabilities/data-quality-report.md", "capabilities"), ("standards/decision-register.ttl", "decisions")):
                current = gov.root / relp
                check(current.exists() and (copy / relp).read_text() == current.read_text(), "D9",
                      f"{relp} is out of date with its sources: run `semtool {cmd}` and commit the result")
        for p in sorted((root / "domains").glob("*/*/semantic.yaml")):
            sd = Repo(p.parent)
            co = sd.root / "CODEOWNERS"
            check(co.exists() and co.read_text() == codeowners_text(sd), "D9",
                  f"{co.relative_to(root)} is out of date with domain-manifest.ttl: run `semtool codeowners` and commit the result")
        # D10 FIBO pin
        tag = gov.cfg["fibo"]["release_tag"]
        pinned = False
        for gm in (root / ".gitmodules", fx_dir / ".gitmodules"):
            if gm.exists():
                m = re.search(r'\[submodule "[^"]*fibo[^"]*"\][^\[]*?branch\s*=\s*(\S+)', gm.read_text())
                if m:
                    pinned = True
                    check(m.group(1) == tag, "D10", f"{gm.relative_to(root)} pins FIBO branch {m.group(1)} but semantic.yaml fibo.release_tag is {tag}")
        if not pinned:
            notes.append("D10 no .gitmodules pins a FIBO branch; the pin is checked only against the checkout")
        ui_file = fx_dir / "profile" / "upstream-issues.yaml"
        if ui_file.exists():
            ui = yaml.safe_load(ui_file.read_text()) or {}
            check(str(ui.get("fibo_release")) == tag, "D10",
                  f"fibo-extensions/profile/upstream-issues.yaml is for FIBO {ui.get('fibo_release')} but the pinned release is {tag}: "
                  "re-validate every entry against the new release, then update fibo_release (ADR-0007)")
        vend = fx_dir / "vendor" / "fibo"
        if (vend / ".git").exists():
            def git_out(*a):
                return subprocess.run(["git", "-C", str(vend), *a], capture_output=True, text=True).stdout.strip()
            head, tag_commit = git_out("rev-parse", "HEAD"), git_out("rev-parse", "-q", "--verify", f"refs/tags/{tag}^{{commit}}")
            if tag_commit:
                check(head == tag_commit, "D10", f"FIBO checkout is at {head[:12]} but release tag {tag} is {tag_commit[:12]}: "
                      "the submodule pin and fibo.release_tag disagree")
            else:
                notes.append(f"D10 release tag {tag} is not available in the FIBO checkout (make fetches it; offline?); "
                             "the checkout was not compared with the release")
        # D11 rules link to standards that exist and to decisions in use (ADR-0010)
        catalogue = load(gov.files("decisions"))
        for subj, path in sorted(catalogue.subject_objects(GOV.definedIn)):
            doc, _, frag = str(path).partition("#")
            target = root / doc
            if not (root / doc.split("/", 1)[0]).exists():
                notes.append(f"D11 {short(subj)}: {doc} is in another repository that is not checked out here")
                continue
            if check(target.is_file(), "D11", f"{short(subj)} is defined in {doc}, which does not exist"):
                if frag and target.suffix == ".md":
                    check(frag in markdown_anchors(target.read_text()), "D11",
                          f"{short(subj)} is defined in {doc}#{frag}, but that document has no such section")
        SH_ = Namespace("http://www.w3.org/ns/shacl#")
        shapes = load(gov.files("shapes"))
        targeted = {s for p in (SH_.targetClass, SH_.targetSubjectsOf, SH_.targetObjectsOf, SH_.targetNode)
                    for s in shapes.subjects(p, None)}
        for shp in sorted(targeted):
            check((shp, GOV.definedIn, None) in catalogue, "D11",
                  f"meta-shape {short(shp)} has no ent-gov:definedIn in standards/enterprise-rules.ttl")
            check((shp, GOV.justifiedBy, None) in catalogue, "D11",
                  f"meta-shape {short(shp)} has no ent-gov:justifiedBy (the ADR that justifies it) in standards/enterprise-rules.ttl")
        cited = set(catalogue.objects(None, GOV.justifiedBy))
        for d in sorted(catalogue.subjects(GOV.decisionStatus, Literal("Accepted"))):
            if d not in cited:
                notes.append(f"D11 {catalogue.value(d, SKOS.notation)} is accepted but no rule cites it (ent-gov:justifiedBy)")

    for n in notes:
        warn(n)
    if problems:
        for p in problems:
            fail(p)
        return False
    ok(f"drift: {repo.kind} is consistent with the registry, manifests, capability map and generated files")
    return True


# =============================================================================
# changes  (version bumps match the change class; run on pull requests)
# =============================================================================

EDITORIAL_AV = {"agentGuidance", "businessExample", "changeNote"}
EDITORIAL_PREDICATES = {RDFS.label, RDFS.comment, SKOS.definition, SKOS.editorialNote, SKOS.example, SKOS.prefLabel,
                        SKOS.altLabel, DCTERMS.abstract, DCTERMS.description, SH.message, SH.name, SH.description}
TERM_TYPES = {OWL.Class, OWL.ObjectProperty, OWL.DatatypeProperty, OWL.AnnotationProperty, SH.NodeShape, SKOS.Concept}
HEADER_PREDICATES = {OWL.versionInfo, OWL.versionIRI, DCTERMS.modified}
LEVELS = ["none", "patch", "minor", "major"]


def semver(v) -> tuple[int, int, int] | None:
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", str(v or ""))
    return tuple(int(x) for x in m.groups()) if m else None


def bump_level(old, new) -> str:
    o, n = semver(old), semver(new)
    if not o or not n or n <= o:
        return "none"
    return "major" if n[0] > o[0] else "minor" if n[1] > o[1] else "patch"


def git_show(root: Path, ref: str, path: str) -> str | None:
    r = subprocess.run(["git", "-C", str(root), "show", f"{ref}:{path}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def classify_change(old: Graph, new: Graph, ns: str) -> tuple[str, list[str]]:
    """Change class of a module: breaking (major), additive (minor), editorial (patch) or none."""
    def terms(g):
        return {s for t in TERM_TYPES for s in g.subjects(RDF.type, t) if isinstance(s, URIRef) and str(s).startswith(ns)}

    def body(g):
        # version numbers and graph names are release bookkeeping, not content
        return {(s, p, o) for s, p, o in g if not (p in HEADER_PREDICATES and (s, RDF.type, OWL.Ontology) in g)
                and p != OWL.versionInfo and not str(p).endswith("/fabric/model/graphName")
                and not isinstance(s, BNode) and not isinstance(o, BNode)}

    ot, nt = terms(old), terms(new)
    why = []
    removed, added = ot - nt, nt - ot
    if removed:
        why.append("removed: " + ", ".join(sorted(short(x) for x in removed)[:6]))
    for s in ot & nt:
        for p in (RDFS.subClassOf, RDFS.subPropertyOf, RDFS.domain, RDFS.range, SH.targetClass):
            gone = {o for o in old.objects(s, p) if isinstance(o, URIRef)} - {o for o in new.objects(s, p) if isinstance(o, URIRef)}
            if gone:
                why.append(f"{short(s)} {short(p)} changed")
    if why:
        return "major", why
    if added:
        return "minor", ["added: " + ", ".join(sorted(short(x) for x in added)[:6])]
    old_b, new_b = body(old), body(new)

    def editorial(p):
        # labels, definitions, notes, messages and agent-facing prose; NOT ruleStatement, governedBy, policySource,
        # owningDomain, regulatoryCitation ... (annotation-profile values that carry meaning or accountability)
        return p in EDITORIAL_PREDICATES or str(p).rsplit("/", 1)[-1] in EDITORIAL_AV

    def bnode_part(g, drop_editorial=False):
        from rdflib.compare import to_isomorphic
        part = Graph()
        for t in g:
            if (isinstance(t[0], BNode) or isinstance(t[2], BNode)) and not str(t[1]).endswith("/fabric/model/graphName") \
                    and not (drop_editorial and editorial(t[1])):
                part.add(t)
        return to_isomorphic(part)

    blank_changed = bnode_part(old, drop_editorial=True) != bnode_part(new, drop_editorial=True)
    blank_text_changed = bnode_part(old) != bnode_part(new)
    if old_b != new_b or blank_changed or blank_text_changed:
        # constraint or axiom changes on existing terms (bnodes) need at least minor; label/definition text is patch
        structural = any(not editorial(p) for _, p, _ in (old_b ^ new_b))
        return ("minor" if structural or blank_changed else "patch"), ["statements or constraints changed" if (structural or blank_changed) else "annotations only"]
    return "none", []


def cmd_changes(repo: Repo, args) -> bool:
    """Compare the working tree with --base: every changed module bumps its version by at least the change
    class; changed knowledge bumps the collection version; standard changes carry an ADR."""
    if not args.base:
        sys.exit("changes: --base <git ref> is required (e.g. origin/main)")
    top = Path(subprocess.run(["git", "-C", str(repo.root), "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip())
    nested = [f":(exclude){p.parent.relative_to(top)}" for p in repo.root.rglob("semantic.yaml") if p.parent != repo.root]
    diff = subprocess.run(["git", "-C", str(top), "diff", "--name-status", "--find-renames", args.base, "--", str(repo.root), *nested],
                          capture_output=True, text=True)
    if diff.returncode != 0:
        fail(f"changes: git diff against {args.base} failed: {diff.stderr.strip()}")
        return False
    untracked = subprocess.run(["git", "-C", str(top), "ls-files", "--others", "--exclude-standard", "--", str(repo.root), *nested],
                               capture_output=True, text=True).stdout.split()
    changed: dict[str, str | None] = {}   # new path -> old path (None = added)
    deleted: list[str] = []
    for line in diff.stdout.splitlines():
        parts = line.split("\t")
        st = parts[0]
        if st.startswith("R"):
            changed[parts[2]] = parts[1]
        elif st == "D":
            deleted.append(parts[1])
        elif st == "A":
            changed[parts[1]] = None
        else:
            changed[parts[1]] = parts[1]
    for u in untracked:
        changed.setdefault(u, None)
    strict = args.strict
    base = repo.base_iri
    problems, warnings, summary = [], [], []

    def report(release: bool, msg: str):
        (problems if (release or strict) else warnings).append(msg)

    governed = {str(p.relative_to(top)) for p in governed_rdf_files(repo)}
    for path in deleted:
        if path.endswith(".ttl") and not {"tests", "examples", "build"} & set(Path(path).parts):
            old_txt = git_show(top, args.base, path) or ""
            old = Graph().parse(data=old_txt, format="turtle") if old_txt else Graph()
            for o in old.subjects(RDF.type, OWL.Ontology):
                release = old.value(o, FIBO_AV.hasMaturityLevel) == FIBO_AV.Release
                report(release, f"{path}: module {o} was deleted (breaking: deprecate its terms instead, and raise an ADR)")
    for path, old_path in sorted(changed.items()):
        if path not in governed:
            continue
        new = Graph().parse(str(top / path), format=guess_format(path))
        old_txt = git_show(top, args.base, old_path) if old_path else None
        if not old_txt:
            summary.append(f"{path}: new module")
            continue
        old = Graph().parse(data=old_txt, format="turtle")
        for o in old.subjects(RDF.type, OWL.Ontology):
            if (o, RDF.type, OWL.Ontology) not in new:
                release = old.value(o, FIBO_AV.hasMaturityLevel) == FIBO_AV.Release
                ov = old.value(o, OWL.versionInfo)
                need = "minor" if semver(ov) and semver(ov)[0] == 0 else "major"
                bumped = any(LEVELS.index(bump_level(ov, new.value(n, OWL.versionInfo))) >= LEVELS.index(need)
                             for n in new.subjects(RDF.type, OWL.Ontology))
                msg = f"{path}: module IRI {o} no longer declared (renamed?) - importers break; breaking change"
                if bumped:
                    warnings.append(msg + " - an ADR and a consumer impact note are required")
                else:
                    report(release, msg + f", needs a {need} version bump and an ADR")
        for o in new.subjects(RDF.type, OWL.Ontology):
            if (o, RDF.type, OWL.Ontology) not in old:
                continue
            ns = str(o) if repo.kind != "domain" else repo.cfg["domain"]["namespace"]
            cls, why = classify_change(old, new, ns)
            if cls == "none":
                continue
            ov, nv = old.value(o, OWL.versionInfo), new.value(o, OWL.versionInfo)
            got = bump_level(ov, nv)
            need = cls
            if semver(ov) and semver(ov)[0] == 0 and need == "major":
                need = "minor"   # 0.y.z: breaking changes bump MINOR until the first 1.0.0 release
            release = new.value(o, FIBO_AV.hasMaturityLevel) == FIBO_AV.Release
            summary.append(f"{path}: {cls} change ({'; '.join(why)}), version {ov} -> {nv}")
            if LEVELS.index(got) < LEVELS.index(need):
                report(release, f"{path}: {cls} change ({'; '.join(why)}) needs a {need} version bump, got {ov} -> {nv}"
                       + (" (maturity Release)" if release else ""))
            if cls == "major" and release:
                warnings.append(f"{path}: breaking change to Release content - an ADR and a consumer impact note are required")
    # collections: changed knowledge => new collection version (the KG serves by version)
    if repo.kind == "domain":
        FAB = Namespace(base + "fabric/model/")
        cfile = repo.files("collections")
        new_c = load(cfile)
        old_c = Graph()
        for f in cfile:
            t = git_show(top, args.base, str(f.relative_to(top)))
            if t:
                old_c.parse(data=t, format="turtle")
        for coll, version, part, gname, files in collection_partitions(repo):
            touched = [str(f.relative_to(top)) for f in files if str(f.relative_to(top)) in changed]
            if touched:
                old_v = next((str(v) for v in old_c.objects(coll, OWL.versionInfo)), None)
                if old_v is not None and old_v == version:
                    release = any(new_c.value(o, FIBO_AV.hasMaturityLevel) == FIBO_AV.Release for o in new_c.subjects(RDF.type, OWL.Ontology))
                    report(release, f"collection {short(coll)} v{version}: partition '{str(gname).rsplit('/', 1)[-1]}' changed "
                           f"({', '.join(touched[:3])}) but the collection version was not bumped (graph names must change with content)")
    # enterprise standards: machine-checked standard changes need an ADR
    if repo.kind == "governance":
        std = [p for p in list(changed) + deleted if p.startswith(str(repo.root.relative_to(top)) + "/shapes/")
               or p.startswith(str(repo.root.relative_to(top)) + "/standards/")]
        adr = [p for p in changed if "/docs/adr/" in p]
        if std and not adr:
            problems.append(f"enterprise standard changed ({', '.join(std[:3])}) without an ADR in docs/adr/ "
                            "(change class: enterprise standard; see docs/adr/README.md)")
    for s in summary:
        info(s)
    for w in sorted(set(warnings)):
        warn(w)
    if problems:
        for p in problems:
            fail(p)
        return False
    ok(f"changes vs {args.base}: versions match the change classes" + (f" ({len(warnings)} warning(s) on Provisional content)" if warnings else ""))
    return True


# =============================================================================
# rebase
# =============================================================================

def cmd_rebase(repo: Repo, args) -> bool:
    old = repo.base_iri
    new = args.to if args.to.endswith("/") else args.to + "/"
    targets = [repo.governance.root]
    if args.all:
        # every repository, sub-domain, business domain and the domain template, at any depth
        top = repo.governance.root.parent
        skip = {"vendor", "venv", ".venv", ".git", "build", "_template-check", "node_modules"}
        found = {p.parent for pat in ("semantic.yaml", "copier.yml") for p in top.rglob(pat)
                 if not skip & set(p.relative_to(top).parts)}
        targets = sorted(t for t in found if not any(t != o and o in t.parents for o in found))  # outermost only
    n = 0
    seen: set[Path] = set()
    for t in targets:
        for p in t.rglob("*"):
            if p in seen or not p.is_file():
                continue
            seen.add(p)
            if p.suffix in (".ttl", ".yaml", ".yml", ".rq", ".md", ".json", ".jinja", ".py", ".csv") \
                    and not {"vendor", "venv", ".venv", ".git", "build"} & set(p.relative_to(t).parts):
                s = p.read_text()
                if old in s:
                    p.write_text(s.replace(old, new))
                    n += 1
    ok(f"rebase: {old} -> {new} in {n} files ({len(targets)} repositories)")
    return True


# =============================================================================
# verify
# =============================================================================

def cmd_verify(repo: Repo, args) -> bool:
    print(f"{BOLD}== verify {repo.root.name} ({repo.kind}){RESET}")
    steps = [cmd_syntax, cmd_structure, cmd_meta, cmd_drift]
    if repo.kind in ("fibo-extensions", "domain", "business-domain"):
        steps += [cmd_extensions, cmd_closure, cmd_reason]
    if repo.kind == "domain":
        steps += [cmd_codeowners, cmd_rules, cmd_kg, cmd_cq, cmd_cards]
    results = []
    for step in steps:
        start = len(_MESSAGES)
        try:
            results.append(step(repo, args))
        except Exception as e:  # noqa: BLE001
            fail(f"{step.__name__[4:]}: {type(e).__name__}: {e}")
            results.append(False)
        name = step.__name__[4:]
        _STEPS.append({"step": name, "gate": GATE_OF_STEP.get(name), "passed": results[-1],
                       "messages": _MESSAGES[start:]})
    passed = all(results)
    (ok if passed else fail)(f"verify {repo.root.name}: {sum(results)}/{len(results)} checks passed")
    return passed


# =============================================================================
# run reports  (build/reports/<command>.json, read by semantic-studio)
# =============================================================================

# The gate each verify step belongs to (docs/framework/02-enterprise-governance.md); codeowners is
# housekeeping (regenerates CODEOWNERS; D9 checks it is current).
GATE_OF_STEP = {"syntax": "G1", "structure": "G1", "meta": "G2", "extensions": "G3", "closure": "G4",
                "reason": "G4", "rules": "G5", "cq": "G6", "kg": "G7", "cards": "G7", "drift": "G8",
                "codeowners": None}
_STEPS: list[dict] = []
REPORTED = {"verify", "syntax", "structure", "meta", "extensions", "closure", "reason", "rules", "cq", "kg",
            "cards", "drift", "changes"}


def _now() -> str:
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_report(repo: Repo, args, passed: bool, started: str) -> None:
    """Leave the outcome of this run where tools can read it: the checks run, pass/fail and every message.
    Reports are build output (git-ignored); a failure to write one never fails the check."""
    if args.command not in REPORTED:
        return
    name = args.command + (f"-{args.reasoner.lower()}" if args.command == "reason" else "")
    steps = _STEPS or [{"step": args.command, "gate": GATE_OF_STEP.get(args.command), "passed": passed,
                        "messages": _MESSAGES}]
    try:
        head = subprocess.run(["git", "-C", str(repo.root), "rev-parse", "HEAD"], capture_output=True,
                              text=True).stdout.strip()
        report = {"command": args.command, "reasoner": args.reasoner if args.command == "reason" else None,
                  "repo": repo.root.name, "kind": repo.kind, "started": started, "finished": _now(),
                  "commit": head or None, "passed": passed, "steps": steps}
        out = repo.root / "build" / "reports" / f"{name}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=1) + "\n")
    except OSError:
        pass


# =============================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--source", help="capabilities: capability map file (csv/xlsx)")
    ap.add_argument("--reasoner", default="ELK", help="reason: ELK (default) or HermiT")
    ap.add_argument("--show", type=int, default=0, help="cq: print first N rows")
    ap.add_argument("--to", help="rebase: new base IRI")
    ap.add_argument("--all", action="store_true", help="rebase: all repositories, sub-domains and the domain template")
    ap.add_argument("--base", help="changes: git ref to compare with (e.g. origin/main)")
    ap.add_argument("--strict", action="store_true", help="changes: treat findings on Provisional content as failures")
    args = ap.parse_args()
    fn = globals().get("cmd_" + args.command.replace("-", "_"))
    if not fn:
        sys.exit(f"unknown command {args.command}")
    repo = Repo(args.repo)
    started = _now()
    passed = bool(fn(repo, args))
    write_report(repo, args, passed, started)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
