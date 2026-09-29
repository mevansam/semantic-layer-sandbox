# Enterprise semantic layer: sandbox

An ontology-based semantic layer for grounding AI agents in business meaning, rules, processes, data sources and specifications. It is governed by the enterprise taxonomy and capability map, built on FIBO, and served to agents through a knowledge graph via GraphRAG.

> **Business domains are accountable for meaning, rules, data, records and APIs.
> The enterprise governs how that knowledge is represented, shared and consumed by AI.**

## Repositories

| Repo | Pillar | Role |
|---|---|---|
| [`enterprise-semantic-governance/`](enterprise-semantic-governance) | Enterprise governance **+ semantic fabric** | Ontology standards and meta-shapes; semantic review; AI risks and controls; cross-domain alignment; taxonomy (SKOS) and capability map; knowledge collections, KG management, reusable assets, execution models, GraphRAG contract; the `semtool` CLI and reusable CI |
| [`fibo-extensions/`](fibo-extensions) | FIBO foundation | FIBO pinned read-only (`master_2026Q2` submodule); enterprise FIBO profile; enterprise-core extensions; alignment axioms; domain registry; extension rules E1–E7 |
| [`domain-template/`](domain-template) | Domain ownership | Copier template (plus a no-Copier scaffolder) that every domain repo is generated from |
| [`planning-and-guidance-financial-plan-management/`](planning-and-guidance-financial-plan-management) | Domain ownership | First domain: **Financial Plan Management** (Planning and Guidance ontology domain). Its first slice is self-directed wealth planning, insights & analytics |

```
             enterprise taxonomy (SKOS) ─┐   capability map (ontology domains › business domains › capabilities) ─┐
                                         ▼                        ▼
 FIBO (pinned) ─▶ enterprise FIBO profile ─▶ enterprise core ◀── domain ontologies ◀── domain-template
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
make align                                                       # how each domain lines up with domain-template
```

## Gates (from `enterprise-semantic-governance/GOVERNANCE.md`)

G1 syntax and domain-repo structure · G2 standards (meta-shapes) · G3 FIBO extension rules · G4 coherence with FIBO (ELK in `verify`, plus HermiT in CI) · G5 business rules (positive and negative tests) · G6 competency questions · G7 knowledge graph plus GraphRAG export.

## Placeholders to replace

| What | Where | How |
|---|---|---|
| Namespace `https://ontology.example.com/` | everywhere | `python enterprise-semantic-governance/tools/semtool.py rebase --to https://ontology.<company>.com/ --all` |
| Capability-map gaps and proposed capabilities | `enterprise-semantic-governance/capabilities/data-quality-report.md` | send to the map owners; when the map is fixed, re-run `semtool capabilities` and trim `curation.yaml` (ADR-0004) |
| Role holders and teams | each `domain-manifest.ttl`, governance `semantic.yaml` | edit, then run `semtool codeowners` |
| Policy sources, retention periods, regulatory citations | domain `rules/`, `records/` | confirm with rule owners, Records, Legal & Compliance |
| Control framework mappings (NIST AI RMF, ISO/IEC 42001) | `enterprise-semantic-governance/ontology/controls.ttl` | map to the enterprise control framework |
