# 08 · Semantic fabric: collections, knowledge graph, assets, execution models

Owner: semantic fabric platform. Model: `fabric/fabric.ttl`. Retrieval contract: `fabric/graphrag/retrieval-contract.yaml`.

## Governed knowledge collections

A **knowledge collection** is the only way domain knowledge reaches AI. It is:
- published by one domain (`ent-fab:publishedBy`)
- versioned (`owl:versionInfo`, semver)
- classified (`ent-fab:sensitivity`)
- policy-bound (`ent-fab:usagePolicy`, an ODRL policy that names permitted agent classes and purposes, plus prohibitions)
- risk-assessed

It is partitioned into **named graphs**, one per asset kind: ontology, rules, processes, apis, stewardship, records, manifest, execution.

### Named-graph convention

```
{base}graph/{publisher}/{collection}/v{MAJOR.MINOR.PATCH}/{partition}
e.g. https://ontology.example.com/graph/rwm-pg/planning-and-guidance/v0.1.0/rules
```

Enterprise graphs use publisher `enterprise`: governance ontology, taxonomy and capability map, reusable assets, enterprise FIBO extensions, registry. FIBO itself is loaded as `{base}graph/fibo/{release_tag}/…`.

## Knowledge graph management

- `semtool kg` assembles a repo's collections and the enterprise graphs into one TriG dataset (`build/kg.trig`). The platform pipeline loads released datasets into the serving triple store (graph store protocol, replacing each graph whole).
- **Only released versions are served** (CTL-003). A new collection version is loaded alongside the old one, then switched atomically; the retired version's graphs are dropped.
- Provenance: each load records `prov:wasDerivedFrom` (repo and commit) and `prov:generatedAtTime` for each graph in the platform's provenance graph.

## GraphRAG

- Retrieval unit: a **concept card** (see the retrieval contract), exported by `semtool cards` to `build/graphrag/cards.jsonl` and `edges.jsonl`.
- Flow:
  1. Filter by policy for the agent class and purpose.
  2. Run vector and keyword search over card `text`.
  3. Expand 1–2 hops along the contract's edge predicates.
  4. Assemble context with citations.
  5. Call execution models for anything that must be *computed* or *checked*, not free-text reasoned.

## Reusable semantic assets

- Shared shapes and patterns live in `fabric/reusable-assets/`. Domains reference them with `sh:node`.
- New assets arrive through semantic review. Typically a domain proposes promoting a shape that a second domain needs.

## Published execution models

| Type | What an agent runs | Required |
|---|---|---|
| **RulePack** | a bundle of domain SHACL rules evaluated against an agent's proposed output | `derivedFromRule`, CTL-005 where it guards a regulated boundary |
| **ProcessModel** | an orchestration of a domain process's agent-assisted steps | `implementsProcess` |
| **QueryTool** | a parameterized SPARQL template with a JSON input schema, exposed as an agent tool (for example as an MCP tool) | `artifactPath`, `inputSchemaPath` |

All types also require `toolName`, `groundedIn` (a collection), CTL-006, and an approved risk assessment.
