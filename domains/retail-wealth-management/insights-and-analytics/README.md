# Insights and Analytics

Semantic repository of the **Insights and Analytics** sub-domain of the **Retail Wealth Management** business domain (Investment Servicing ontology domain in the capability map). It was generated from `domains/domain-template`.

This domain is accountable for **meaning, rules, data, records and APIs**. The enterprise governs how that knowledge is represented, shared and consumed by AI (see `enterprise-governance`).

| Folder | Accountability | Owner (see `domain-manifest.ttl`, `CODEOWNERS`) |
|---|---|---|
| `domain-manifest.ttl` | who is accountable for what; taxonomy anchors; capabilities | domain owner |
| `ontology/` | **Meaning**: business concepts specializing FIBO | domain owner |
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

## Extension points

- **Builds on:** `../financial-planning` (imports its published module `https://ontology.example.com/domain/retail-wealth-management/financial-planning/planning/`). Dependencies run one way; this sub-domain never mints terms in another's namespace.
- **Published for others:** the modules listed for `rwm-ia` in `fibo-extensions/registry/domain-registry.ttl`. Anything published is a contract; breaking changes need a MAJOR version.
- **Parent:** `../domain.ttl` imports this sub-domain's published module into the Retail Wealth Management umbrella.

## Namespace

`https://ontology.example.com/domain/retail-wealth-management/insights-and-analytics/` (registered as `rwm-ia` in `fibo-extensions/registry`).

## Validating

CI runs gates G1–G8 on this sub-domain; they also produce its knowledge graph and GraphRAG concept cards. To run them yourself, see [Validate a sub-domain](../../../README.md#validate-a-sub-domain) in the root README.

## Changing things

- **New concept:** add it to `ontology/` with a FIBO parent, a taxonomy anchor, a definition and agent guidance.
- **New rule:** add a shape to `rules/` with id, statement, policy source and owner. Add a negative test to `tests/negative/`.
- **Anything exposed to agents:** it must be in the collection's partitions. New execution models need a risk assessment approved by the AI risk office.
- **Role holder changes:** update `domain-manifest.ttl`, then regenerate `CODEOWNERS` (see [Regenerate generated files](../../../README.md#regenerate-generated-files) in the root README).

## Current content (v0.1.0)

Self-directed insights (categories, suggested actions) and the financial health score (`ontology/assessments.ttl`, earmarked for Financial Assessments). Also:
- 3 rules, including the **advice boundary IA-R-001**
- the insight cycle (3 steps; step 2 is agent-assisted), which starts from Financial Planning's goal projections
- the Insights API, the insights-and-scores data product and insight records
- a knowledge collection
- the `rwm_ia_advice_boundary_rulepack`, `rwm_ia_customer_insights` and `rwm_ia_insight_cycle` execution models

It **builds on Financial Planning** (see Extension points). See `docs/modeling-notes.md`.
