# Enterprise Governance (+ Semantic Fabric)

The baseline that sets **how** enterprise knowledge is represented, shared and consumed by AI. Business domains own **what** it means (see `domain-template`). FIBO is the upper ontology (see `fibo-extensions`).

```
enterprise-governance/              ← you are here: standards + fabric
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
| `standards/enterprise-rules.ttl` | all | Catalogue of the rules the enterprise imposes on domains (gates, extension rules, drift checks, change-class and review rules). Each rule, and each meta-shape, links to the standard that defines it and the ADR that justifies it |
| `standards/decision-register.ttl` | all | The ADRs as RDF, generated from `docs/adr/` (`semtool decisions`) |
| `taxonomy/` | Governance | Enterprise taxonomy source (markdown) → SKOS (476 concepts) |
| `capabilities/` | Governance | Enterprise capability map (8 ontology domains, 38 business domains): curated import, taxonomy crosswalk, data-quality report (ADR-0004) |
| `alignment/` | Cross-domain alignment | Alignment decision register |
| `fabric/fabric.ttl` | Semantic fabric | Knowledge collections, graph partitions, agent classes, purposes, execution models |
| `fabric/reusable-assets/` | Semantic fabric | Shared shapes and patterns (monetary amount, model provenance, 0–100 score…) |
| `fabric/graphrag/retrieval-contract.yaml` | Semantic fabric | What GraphRAG retrieves, as which unit, with which citations and runtime obligations |
| `docs/standards/01…08` | all | Standards documents |
| `docs/adr/` | all | Architecture decision records: why the rules that bind domains exist ([when one is needed](docs/adr/README.md)) |
| `tools/semtool.py` | all | The one CLI used by every repo, locally and in CI |
| `tools/tests/selftest.py` | all | Self-test: every check must catch a seeded defect (`make selftest`) |
| `.github/workflows/semantic-ci.yml` | all | Reusable CI workflow (gates G1–G8) |

## Running and validating

Setup, validation and testing commands for every part of the framework are in the [root README](../README.md#run-validate-and-test). The full tooling reference is [`docs/framework/08-validation-tooling.md`](../docs/framework/08-validation-tooling.md); how to make each kind of change is in [doc 7](../docs/framework/07-change-management.md).

## Configuration

`semantic.yaml` holds the enterprise base IRI (placeholder `https://ontology.example.com/`), the source-control teams used to generate CODEOWNERS, the pinned FIBO release, and the named-graph template.
