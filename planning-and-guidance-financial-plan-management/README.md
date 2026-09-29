# Financial Plan Management

Semantic repository of the **Financial Plan Management** business domain in the **Planning and Guidance** ontology domain (enterprise capability map, ADR-0004). Its first slice is **self-directed wealth planning, insights & analytics**. It was generated from `domain-template`.

This domain is accountable for **meaning, rules, data, records and APIs**. The enterprise governs how that knowledge is represented, shared and consumed by AI (see `enterprise-semantic-governance`).

| Folder | Accountability | Owner (see `domain-manifest.ttl`, `CODEOWNERS`) |
|---|---|---|
| `domain-manifest.ttl` | who is accountable for what; taxonomy anchors; capabilities | domain owner |
| `ontology/` | **Meaning**: business concepts specializing FIBO (`planning.ttl`; `assessments.ttl` is incubated for Financial Assessments) | domain owner |
| `rules/` | **Rules**: SHACL shapes with authoritative rule statements | rule owner |
| `processes/` | process knowledge: steps, roles, rules applied, APIs, records | domain owner |
| `apis/` | **APIs**: OpenAPI contracts with `x-ontology-*` annotations, plus registry | API owner |
| `stewardship/` | **Data**: data products and critical data elements | data steward |
| `mappings/` | **Data**: RML mappings from physical sources | data steward |
| `records/` | **Records**: record classes, retention, legal hold | records owner |
| `collections/` | fabric: governed knowledge collection, ODRL usage policy, AI risk assessment | domain owner + fabric + AI risk |
| `execution-models/` | fabric: rule packs, process models, query tools for agents | domain owner + fabric + AI risk |
| `competency-questions/` | questions the knowledge graph must answer (gate G6): cq-001…005 from the template, cq-101+ domain-specific | domain owner |
| `examples/`, `tests/negative/` | positive and negative test data for rules (gate G5) | rule owner |
| `docs/modeling-notes.md` | semantic review record: FIBO parent choices, rules ↔ tests ↔ tools, open items | domain owner |

Structure: this repository follows the enterprise domain repository standard (`semtool structure`, gate G1). Edit files in place; add files only where the naming conventions allow (`<toolName>.rq`, `cq-101-…`, `nc-NNN-…`).

## Namespace

`https://ontology.example.com/domain/planning-and-guidance/financial-plan-management/` (registered as `pg-fpm` in `fibo-extensions/registry`).

## Working locally

```bash
# siblings: ../enterprise-semantic-governance  ../fibo-extensions  (see semantic.yaml)
export ROBOT_JAR=/path/to/robot.jar
python ../enterprise-semantic-governance/tools/semtool.py verify --repo .
python ../enterprise-semantic-governance/tools/semtool.py cq --repo . --show 5
```

`verify` runs gates G1–G7 and writes `build/kg.trig` (knowledge graph) and `build/graphrag/cards.jsonl` (GraphRAG concept cards).

## Changing things

- **New concept:** add it to `ontology/` with a FIBO parent, a taxonomy anchor, a definition and agent guidance.
- **New rule:** add a shape to `rules/` with id, statement, policy source and owner. Add a negative test to `tests/negative/`.
- **Anything exposed to agents:** it must be in the collection's partitions. New execution models need a risk assessment approved by the AI risk office.
- **Role holder changes:** update `domain-manifest.ttl`, then run `semtool codeowners`.

## Current content (seed slice v0.1.0)

The self-directed wealth planning slice covers:
- goals, self-directed plans, planning scenarios and assumptions (with mortality-table provenance), goal projections and self-directed insights
- a financial health score, in `ontology/assessments.ttl`, earmarked for **Financial Assessments**
- seven business rules, including the **advice-boundary rule SDP-R-001** (the advised side is **Retail Wealth Management**)
- a six-step planning process, with projections calculated by **Calculator Management**
- two APIs, two data products and two record classes
- a governed knowledge collection
- three execution models

The domain realizes three **proposed** capabilities under "Financial Planning", because the authoritative capability map has none for Financial Plan Management yet (see `enterprise-semantic-governance/capabilities/data-quality-report.md`).

See `docs/modeling-notes.md` for FIBO parent choices, the advice boundary end to end, and open items.
