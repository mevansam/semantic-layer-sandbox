# Enterprise semantic layer: sandbox

An ontology-based semantic layer for grounding AI agents in business meaning, rules, processes, data sources and specifications. It is governed by the enterprise taxonomy and capability map, built on FIBO, and served to agents through a knowledge graph via GraphRAG.

> **Business domains are accountable for meaning, rules, data, records and APIs.
> The enterprise governs how that knowledge is represented, shared and consumed by AI.**

## Layout

```
enterprise-semantic-governance/      Enterprise governance + semantic fabric: standards, meta-shapes, AI controls,
                                     alignment, taxonomy, capability map, GraphRAG contract, semtool, CI
fibo-extensions/                     FIBO (pinned submodule), enterprise FIBO profile, enterprise core, domain registry,
                                     ontology-domain umbrellas
domains/
├── domain-template/                 Template every sub-domain is generated from (+ parent-template for business domains)
└── retail-wealth-management/        Business domain (parent layer: domain.ttl umbrella + parent manifest)
    ├── planning-and-guidance/       Sub-domain: goals, plans, scenarios, projections  (publishes `planning`)
    └── insights-and-analytics/      Sub-domain: insights, health score, advice boundary (builds on planning-and-guidance)
```

| Layer | Owns | Extension point |
|---|---|---|
| FIBO | financial-industry meaning | pinned, read-only; extended only by subclassing (E1) |
| `fibo-extensions` | the enterprise's slice of FIBO and shared cross-domain terms | profile (which FIBO modules), enterprise core, registry (namespaces, published modules) |
| `domains/<business-domain>/` | business-domain owner, list of sub-domains | `domain.ttl` umbrella imports each sub-domain's published module; verified together |
| `domains/<business-domain>/<sub-domain>/` | meaning, rules, APIs, data, records of one sub-domain | `dependencies`: import another sub-domain's **published** module (one way, no cycles) |

```
             enterprise taxonomy (SKOS) ─┐   capability map (ontology domains › business domains › sub-domains › capabilities)
                                         ▼                        ▼
 FIBO (pinned) ─▶ enterprise FIBO profile ─▶ enterprise core ◀── sub-domain ontologies ◀── domains/domain-template
                                                                   │ rules · processes · APIs · data · records
                                                                   ▼
                                     knowledge collections (named graphs + ODRL policy + risk assessment)
                                                                   │
                                          knowledge graph (TriG) ──┴─▶ GraphRAG concept cards + execution models ─▶ agents
```

## Run everything

```bash
pip install -r enterprise-semantic-governance/requirements.txt
make fibo                                                        # FIBO submodule at the pinned release
bash fibo-extensions/scripts/fetch-omg-dependencies.sh           # OMG Commons + LCC (needs www.omg.org)
export ROBOT_JAR=/path/to/robot.jar                              # https://github.com/ontodev/robot/releases (v1.9.10)
make verify                                                      # all repos, all gates
make align                                                       # how each sub-domain lines up with the template
make hermit                                                      # full OWL DL reasoning per business domain
```

## Gates (from `enterprise-semantic-governance/GOVERNANCE.md`)

G1 syntax and domain-repo structure · G2 standards (meta-shapes) · G3 FIBO extension rules · G4 coherence with FIBO (ELK in `verify`, plus HermiT in CI) · G5 business rules (positive and negative tests) · G6 competency questions · G7 knowledge graph plus GraphRAG export.

## Placeholders to replace

| What | Where | How |
|---|---|---|
| Namespace `https://ontology.example.com/` | everywhere | `python enterprise-semantic-governance/tools/semtool.py rebase --to https://ontology.<company>.com/ --all` |
| Capability-map gaps and proposed capabilities | `enterprise-semantic-governance/capabilities/data-quality-report.md` | send to the map owners; when the map is fixed, re-run `semtool capabilities` and trim `curation.yaml` (ADR-0004) |
| Role holders and teams | each `domain-manifest.ttl` and `domains/*/domain.ttl`, governance `semantic.yaml` | edit, then re-run `make verify` (regenerates CODEOWNERS) |
| Policy sources, retention periods, regulatory citations | domain `rules/`, `records/` | confirm with rule owners, Records, Legal & Compliance |
| Control framework mappings (NIST AI RMF, ISO/IEC 42001) | `enterprise-semantic-governance/ontology/controls.ttl` | map to the enterprise control framework |
