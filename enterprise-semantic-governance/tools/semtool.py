#!/usr/bin/env python3
"""semtool - enterprise semantic layer tooling.

One tool, used by every repository (governance, fibo-extensions, domains) locally
and in CI. Each repository declares what it contains in its own `semantic.yaml`.

Commands
  syntax        parse every governed RDF file
  structure     check a domain repo against the domain repository structure standard
  taxonomy      generate the SKOS enterprise taxonomy from its markdown source
  capabilities  import a capability map (CSV/XLSX) into SKOS + domain register
  meta          validate governed assets against the enterprise meta-shapes
  extensions    enforce FIBO extension rules (no FIBO redefinition, namespaces, imports)
  closure       build the import closure (repo + enterprise + FIBO profile) as one file
  reason        classify the closure with ROBOT/ELK and fail on unsatisfiable classes
  rules         run domain business rules against positive and negative examples
  cq            run competency questions against the assembled knowledge graph
  kg            assemble the knowledge graph dataset (TriG, one named graph per partition)
  cards         export GraphRAG concept cards + edges from the knowledge graph
  codeowners    generate CODEOWNERS from the domain manifest
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


def ok(msg): print(f"{GREEN}PASS{RESET} {msg}")
def warn(msg): print(f"{YELLOW}WARN{RESET} {msg}")
def fail(msg): print(f"{RED}FAIL{RESET} {msg}")
def info(msg): print(f"     {msg}")


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
        skip = {"vendor", "build", ".git", "template", "node_modules"}
        res = []
        for p in self.root.rglob("*"):
            if p.suffix in (".ttl", ".trig") and not (set(p.relative_to(self.root).parts) & skip):
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
              "# Owned by: Enterprise Semantic Governance. Change the source + re-run; do not hand-edit.\n")
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
        if d not in domains:
            warn(f"capabilities: proposed capability for unknown domain '{d}'")
            continue
        c = add_node(path, status="Proposed", description=pc.get("description"))
        g.add((c, SKOS.editorialNote, Literal("PROPOSED by the domain; not yet in the authoritative capability map.", lang="en")))
        g.add((c, GOV.accountableDomain, dom_iri(d, placements[d])))
        g.add((dom_iri(d, placements[d]), GOV.realizesCapability, c))
        proposed.append((d, pc["path"]))

    # ---- taxonomy crosswalk ------------------------------------------------------------------------
    errors = 0
    xw = cap_dir / "taxonomy-crosswalk.csv"
    if xw.exists():
        for r in read_table(xw):
            d = r["domain"]
            if d not in domains:
                warn(f"capabilities: crosswalk domain '{d}' not in capability map")
                errors += 1
                continue
            for a in filter(None, (x.strip() for x in r["taxonomy_anchors"].split(";"))):
                if (TAX[a], None, None) not in tax:
                    warn(f"capabilities: crosswalk {d}: taxonomy node '{a}' not found")
                    errors += 1
                    continue
                g.add((dom_iri(d, placements[d]), AV.governedBy, TAX[a]))

    out = cap_dir / "capability-map.ttl"
    out.write_text("# GENERATED by tools/semtool.py capabilities (curated per capabilities/curation.yaml). Do not hand-edit.\n"
                   + g.serialize(format="turtle"))

    # ---- data-quality report ---------------------------------------------------------------------------
    gaps = sorted(d for d in domains if not anchors.get(d) and d not in {p[0] for p in proposed})
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
    if repo.kind in ("domain", "fibo-extensions"):
        names.append("meta-business.ttl")
    return load([gov.root / "shapes" / n for n in names])


def local_governed_graph(repo: Repo) -> Graph:
    keys = [k for k in repo.cfg.get("paths", {}) if k not in ("reference", "shapes", "profile", "examples")]
    return load(repo.files(*keys))


def cmd_meta(repo: Repo, args) -> bool:
    data = local_governed_graph(repo)
    ref = reference_view(governance_reference(repo))
    if repo.kind == "domain" and repo.fibo_extensions:
        ref += reference_view(load(repo.fibo_extensions.files("ontology", "registry")))
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
    if repo.kind == "domain":
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
            elif i.startswith(repo.base_iri + "domain/") and repo.kind == "domain" and not i.startswith(repo.cfg["domain"]["namespace"]):
                if i not in published:
                    good = False
                    fail(f"E3 {f.relative_to(repo.root)} imports unpublished module of another domain: {short(i)}")
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
    out = repo.root / "build" / "closure.ttl"
    out.parent.mkdir(exist_ok=True)
    merged.serialize(str(out), format="turtle")
    ok(f"closure: {len(loaded_files)} ontology files, {len(merged)} triples -> {out.relative_to(repo.root)}")
    if missing:
        warn("closure: unresolved imports skipped (run fibo-extensions/scripts/fetch-omg-dependencies.sh "
             "on a network that can reach omg.org): " + ", ".join(f"{k} x{v}" for k, v in sorted(missing.items())))
    (out.parent / "closure-unresolved.json").write_text(json.dumps(missing, indent=2))
    return True


def robot_cmd() -> list[str]:
    jar = os.environ.get("ROBOT_JAR")
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
    r = subprocess.run(cmd, capture_output=True, text=True)
    log = [ln for ln in (r.stdout + r.stderr).splitlines() if ln.strip() and not ln.startswith("Picked up")]
    if r.returncode != 0:
        detail = [ln.split(" - ", 1)[-1].strip() for ln in log
                  if "unsatisfiable" in ln.lower() or "inconsistent" in ln.lower()]
        fail(f"reason ({args.reasoner}): " + (detail[0] if detail else (log[-1] if log else "error")))
        for d in detail[1:]:
            info(d)
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
    for part, keys in (("ontology", ("ontology",)), ("reference", ("reference",)), ("assets", ("assets",)), ("alignment", ("alignment",))):
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
        if include_examples:
            pos = [Path(p) for pat in repo.cfg.get("examples", {}).get("positive", []) for p in glob.glob(str(repo.root / pat))]
            load(pos, ds.graph(URIRef(f"{repo.base_iri}graph/{repo.cfg['domain']['code']}/test/examples")))
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
    (repo.root / "CODEOWNERS").write_text("\n".join(lines) + "\n")
    ok("codeowners: CODEOWNERS generated from domain manifest")
    return True


# =============================================================================
# rebase
# =============================================================================

def cmd_rebase(repo: Repo, args) -> bool:
    old = repo.base_iri
    new = args.to if args.to.endswith("/") else args.to + "/"
    targets = [repo.governance.root]
    if args.all:
        targets = [p for p in repo.governance.root.parent.iterdir() if (p / "semantic.yaml").exists()]
    n = 0
    for t in targets:
        for p in t.rglob("*"):
            if p.is_file() and p.suffix in (".ttl", ".yaml", ".yml", ".rq", ".md", ".json", ".jinja", ".py") \
                    and not {"vendor", ".git", "build"} & set(p.relative_to(t).parts):
                s = p.read_text()
                if old in s:
                    p.write_text(s.replace(old, new))
                    n += 1
    ok(f"rebase: {old} -> {new} in {n} files")
    return True


# =============================================================================
# verify
# =============================================================================

def cmd_verify(repo: Repo, args) -> bool:
    print(f"{BOLD}== verify {repo.root.name} ({repo.kind}){RESET}")
    steps = [cmd_syntax, cmd_structure, cmd_meta]
    if repo.kind in ("fibo-extensions", "domain"):
        steps += [cmd_extensions, cmd_closure, cmd_reason]
    if repo.kind == "domain":
        steps += [cmd_codeowners, cmd_rules, cmd_kg, cmd_cq, cmd_cards]
    results = []
    for step in steps:
        try:
            results.append(step(repo, args))
        except Exception as e:  # noqa: BLE001
            fail(f"{step.__name__[4:]}: {type(e).__name__}: {e}")
            results.append(False)
    passed = all(results)
    (ok if passed else fail)(f"verify {repo.root.name}: {sum(results)}/{len(results)} checks passed")
    return passed


# =============================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--source", help="capabilities: capability map file (csv/xlsx)")
    ap.add_argument("--provisional", action="store_true")
    ap.add_argument("--reasoner", default="ELK", help="reason: ELK (default) or HermiT")
    ap.add_argument("--show", type=int, default=0, help="cq: print first N rows")
    ap.add_argument("--to", help="rebase: new base IRI")
    ap.add_argument("--all", action="store_true", help="rebase: all sibling repositories")
    args = ap.parse_args()
    fn = globals().get("cmd_" + args.command.replace("-", "_"))
    if not fn:
        sys.exit(f"unknown command {args.command}")
    sys.exit(0 if fn(Repo(args.repo), args) else 1)


if __name__ == "__main__":
    main()
