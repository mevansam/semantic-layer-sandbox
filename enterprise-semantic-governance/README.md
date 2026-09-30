# Enterprise Semantic Governance (+ Semantic Fabric)

The baseline that sets **how** enterprise knowledge is represented, shared and consumed by AI. Business domains own **what** it means (see `domain-template`). FIBO is the upper ontology (see `fibo-extensions`).

```
enterprise-semantic-governance/     ← you are here: standards + fabric
fibo-extensions/                    ← pinned FIBO, enterprise FIBO profile, core extensions, domain registry
domains/domain-template/            ← template every sub-domain is generated from
domains/retail-wealth-management/   ← first business domain: financial-planning, insights-and-analytics
```

## What's in this repo

| Path | Pillar | What |
|---|---|---|
| `GOVERNANCE.md` | Governance | Operating model, RACI, two-key review, release gates, change classes |
| `ontology/annotations.ttl` | Ontology standards | Enterprise annotation profile (reuses FIBO AV, SKOS, DCT) |
| `ontology/governance.ttl` | Governance | Domains, manifests, accountable roles, rules, APIs, CDEs, record classes, reviews, alignment |
| `ontology/process.ttl` | Ontology standards | Process vocabulary (PROV-aligned) |
| `ontology/controls.ttl` | AI risks & controls | Risk and control model, control catalog CTL-001…008, sensitivity classes |
| `shapes/meta-*.ttl` | Ontology standards | Meta-shapes: the machine-checked standards every repo must pass |
| `standards/domain-repo-structure.yaml` | Ontology standards | Domain repository structure standard: required files, naming conventions (`semtool structure`) |
| `taxonomy/` | Governance | Enterprise taxonomy source (markdown) → SKOS (476 concepts) |
| `capabilities/` | Governance | Enterprise capability map (8 ontology domains, 38 business domains): curated import, taxonomy crosswalk, data-quality report (ADR-0004) |
| `alignment/` | Cross-domain alignment | Alignment decision register |
| `fabric/fabric.ttl` | Semantic fabric | Knowledge collections, graph partitions, agent classes, purposes, execution models |
| `fabric/reusable-assets/` | Semantic fabric | Shared shapes and patterns (monetary amount, model provenance, 0–100 score…) |
| `fabric/graphrag/retrieval-contract.yaml` | Semantic fabric | What GraphRAG retrieves, as which unit, with which citations and runtime obligations |
| `docs/standards/01…08` | all | Standards documents |
| `docs/adr/` | all | Architecture decision records |
| `tools/semtool.py` | all | The one CLI used by every repo, locally and in CI (see `tools/README.md` and `docs/framework/08-validation-tooling.md` at the root) |
| `tools/tests/selftest.py` | all | Self-test: every check must catch a seeded defect (`make selftest`) |
| `.github/workflows/semantic-ci.yml` | all | Reusable CI workflow (gates G1–G8) |

## Quick start

```bash
pip install -r requirements.txt                       # rdflib, pyshacl, pyyaml, openpyxl
export ROBOT_JAR=/path/to/robot.jar                   # https://github.com/ontodev/robot/releases
python tools/semtool.py verify                        # this repo
python tools/semtool.py verify --repo ../domains/retail-wealth-management/financial-planning   # a sub-domain, all gates
```

## Common tasks

| Task | Command |
|---|---|
| Regenerate taxonomy after editing `taxonomy/source/enterprise-taxonomy.md` | `python tools/semtool.py taxonomy` |
| Re-import the capability map | replace `capabilities/source/capability-map.csv`, review `capabilities/curation.yaml`, run `python tools/semtool.py capabilities` |
| Adopt the real enterprise namespace | `python tools/semtool.py rebase --to https://ontology.<company>.com/ --all` |
| Add a control | edit `ontology/controls.ttl`, update `docs/standards/06`, raise an ADR |
| Check that repeated facts and generated files agree (gate G8) | `python tools/semtool.py drift --repo <folder>` or `make drift` at the root |
| Check version bumps against the change class before a PR | `make changes BASE=origin/main` at the root |
| Understand the framework end to end | `docs/framework/` at the repository root |

## Configuration

`semantic.yaml` holds the enterprise base IRI (placeholder `https://ontology.example.com/`), the source-control teams used to generate CODEOWNERS, the pinned FIBO release, and the named-graph template.
