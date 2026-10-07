# ADR-0004: The capability map is imported through reviewed curation rules

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Semantic review board, capability-map owners consulted

## Context
The semantic model is governed by the enterprise capability map: every domain manifest names the capabilities it realises, and every capability has an accountable domain. The authoritative map (ontology domains > business domains > a capability hierarchy) has no identifiers or taxonomy links. It also has systematic errors:
- whole capability trees copied onto domains they don't belong to
- technology groupings mixed with business capabilities
- doubtful ontology-domain placements
- many domains with no capabilities at all

Importing it as is would make those errors part of every domain's governance.

## Decision
- **Import only correct, business-specific mappings.** The rules are in `capabilities/curation.yaml`:
  - A domain keeps a mapping only where the path contains the domain's own capability, by name or by a reviewed alias.
  - Each capability has exactly one accountable domain.
  - Technology nodes are never business anchors.
  - Doubtful ontology-domain placements stay unplaced until reviewed.
- **Proposed capabilities.** A domain with no capabilities may propose them. They are imported as `Proposed` and sent back to the map owners.
- **Derived identifiers.** Capability IRIs are derived from the capability path.
- **Report back.** Everything excluded, proposed or missing is listed in a generated data-quality report for the map owners. The map is fixed at its source, not in our copy.

## Why
- An accountable domain for every capability is what makes "who owns this?" answerable. Duplicated trees would give many owners.
- Curation rules in one reviewed file make every deviation from the source visible and reversible. When the source is corrected, re-running the import removes the workaround.
- Proposals let new domains start without waiting for the map, without pretending their capabilities are authoritative.

## Alternatives rejected
- **Import the map as is.** Rejected: it would bake its errors into every domain's manifest and review.
- **Hand-maintain a corrected copy.** Rejected: it would drift from the source with every update.
- **Wait for the owners to fix the map.** Rejected: it blocks every domain in the meantime.

## Where the rules are
- [`capabilities/README.md`](../../capabilities/README.md) and [`capabilities/curation.yaml`](../../capabilities/curation.yaml): the curation rules and aliases.
- [`capabilities/data-quality-report.md`](../../capabilities/data-quality-report.md): what was excluded, proposed or missing (generated).
