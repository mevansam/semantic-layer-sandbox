# ADR-0003: Provisional capability map until the authoritative map is imported

- **Status:** Superseded by ADR-0004 (2026-09-28)
- **Date:** 2026-09-28
- **Change class:** Additive

## Context
The semantic model must be governed by the enterprise capability map, which maps capabilities to business domains and names each domain's data ontology. The authoritative map had not been received when the baseline was built.

## Decision
- `capabilities/capability-map.provisional.csv` seeds a small provisional map derived from the taxonomy. It covers Retail Wealth Planning & Advisory in detail and a few other domains at a high level.
- The generated `capability-map.ttl` carries an editorial note marking it PROVISIONAL.
- When the authoritative map arrives:
  1. Add it as `capabilities/capability-map.csv` (or `.xlsx`).
  2. Adjust `capabilities/columns.yaml` to its headers.
  3. Run `python tools/semtool.py capabilities`.
  4. Re-run every domain's CI.

  Domain manifests reference capabilities by IRI, so any renamed capability ids will show up as CI failures to fix.

## Consequences
Everything built on the provisional map is structurally valid. Its capability assignments must be re-confirmed once the real map is imported.
