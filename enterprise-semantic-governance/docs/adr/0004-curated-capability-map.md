# ADR-0004: Curated import of the enterprise capability map

- **Status:** Accepted; decisions 5 (namespaces) and 6 (first domain's repository) superseded by ADR-0005
- **Date:** 2026-09-28
- **Supersedes:** ADR-0003
- **Change class:** Enterprise standard (breaking for the first domain's namespace)

## Context
The authoritative capability map (`capabilities/source/capability-map.csv`, 308 rows) arrived. It maps **38 business (API) domains** to **8 ontology domains** (the named data ontologies) and to a capability hierarchy (L1–L4, 134 nodes). It has no capability IDs, descriptions or taxonomy links, and several mappings are inconsistent:

- Whole capability trees are copied onto domains they don't belong to. For example, the full Benefits Management tree is assigned to Benefits Management, Plan Management, Product & Services and Employer Management.
- Technology groupings ("Shared Software & Technology") are mixed in with business capabilities.
- Some ontology-domain placements look incorrect, such as Legal, Risk, Compliance & Surveillance under Employee Operations.
- 26 domains have no capabilities at all, including every domain behind self-directed wealth planning.
- There is no "Retail Wealth Planning & Advisory" domain.

## Decision
1. **Structure.** Ontology domain (`ent-gov:OntologyDomain`) > business domain (`ent-gov:BusinessDomain`, `ent-gov:inOntologyDomain`) > capability tree (SKOS). Capability IDs are derived from the path, e.g. `ent-cap:investment-management.portfolio-management`.
2. **Import only business-specific, correct mappings** (`capabilities/curation.yaml`):
   - A domain keeps a mapping only where the mapped path contains the domain's own capability: the same name, or a reviewed alias. The deepest such node is the domain's *anchor*.
   - One accountable domain per capability (`ent-gov:accountableDomain`): the domain with the deepest anchor at or above the capability.
   - Technology nodes are typed `ent-gov:TechnologyCapability` and are never used as business anchors.
   - Suspicious ontology-domain placements are not imported; the domain stays unplaced until reviewed.
3. **Proposed capabilities.** Domains with no capabilities may propose them in `curation.yaml`. These are imported with `capabilityStatus "Proposed"` and handed to the map owners through the generated `data-quality-report.md`.
4. **Taxonomy crosswalk.** Domain-to-taxonomy links are kept in `capabilities/taxonomy-crosswalk.csv` (status *proposed*), because the map doesn't carry them.
5. **Namespaces** follow the map: `{base}domain/{ontology-domain}/{business-domain}/`. Each ontology domain has an umbrella ontology in `fibo-extensions/ontology/ontology-domains/`.
6. **The self-directed wealth planning slice** belongs to ontology domain **Planning and Guidance**, business domain **Financial Plan Management**. The repo is `planning-and-guidance-financial-plan-management`, with registry code `pg-fpm`. The financial health score sits in a separate `assessments` module earmarked for **Financial Assessments**. Projections run through **Calculator Management**. The advised side of the advice boundary is **Retail Wealth Management**.

## Consequences
- The kept mappings, the exclusions with reasons, the proposed capabilities and the capability gaps are all listed in `capabilities/data-quality-report.md`. It goes back to the capability-map owners.
- When the map is corrected, re-run `semtool capabilities`. Aliases and proposals that become redundant should be removed from `curation.yaml`.
- The first domain's IRIs changed before any release (v0.1.0, unreleased), so no deprecation mappings are needed.
