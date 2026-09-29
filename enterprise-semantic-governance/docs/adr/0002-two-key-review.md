# ADR-0002: Domains own meaning; the enterprise owns representation (two-key review)

- **Status:** Accepted (baseline)
- **Date:** 2026-09-28
- **Change class:** Enterprise standard

## Context
Central ontology teams become bottlenecks and lose business credibility when they decide meaning. Fully federated teams drift apart and make AI grounding inconsistent.

## Decision
- Business domains are accountable for meaning, rules, data, records and APIs. They hold these in their own repositories and declare their accountable roles in a machine-readable **domain manifest**.
- The enterprise is accountable for how knowledge is represented, shared and consumed by AI: standards, semantic review, AI risk and controls, cross-domain alignment, and the semantic fabric.
- CODEOWNERS is generated from the manifest, so every change needs a domain approval (meaning) and an enterprise approval (representation).

## Consequences
- Accountability can be queried in the knowledge graph ("who owns rule SDP-R-001?").
- A domain cannot publish to AI without the enterprise gates; the enterprise cannot change a domain's meaning.
