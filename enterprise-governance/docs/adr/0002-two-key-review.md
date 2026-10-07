# ADR-0002: Domains own meaning; the enterprise owns representation (two-key review)

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Semantic review board

## Context
Central ontology teams that decide meaning become bottlenecks and lose credibility with the business. Fully federated teams drift apart, and AI grounding becomes inconsistent across domains.

## Decision
- Business domains are accountable for **meaning, rules, data, records and APIs**, in their own repositories. Each declares its accountable roles in a machine-readable domain manifest.
- The enterprise is accountable for **representation**: standards, semantic review, AI risk and controls, cross-domain alignment, and the semantic fabric.
- Every change needs two approvals: the domain's, for meaning, and the enterprise's, for representation. CODEOWNERS is generated from the manifest, so this is enforced by the repository host.
- Nothing reaches AI consumers without passing the enterprise gates.

## Why
- Meaning is best decided by the people accountable for the business; representation is only consistent if one party sets the standard.
- Separating the two keys lets domains move at their own pace while every domain's knowledge stays interoperable.
- Putting roles in the manifest makes accountability queryable ("who owns rule IA-R-001?") and keeps CODEOWNERS from drifting.

## Alternatives rejected
- **A central ontology team owns all meaning.** Rejected: a bottleneck, and meaning loses business ownership.
- **Domains are fully autonomous.** Rejected: inconsistent representation makes cross-domain AI grounding unreliable.
- **CODEOWNERS maintained by hand.** Rejected: it drifts from the accountable roles.

## Where the rules are
- [`GOVERNANCE.md`](../../GOVERNANCE.md): the RACI matrix, two-key review and the release gates.
- [`docs/standards/05-semantic-review.md`](../standards/05-semantic-review.md): what the board reviews.
- [`docs/standards/04-apis-data-records.md`](../standards/04-apis-data-records.md) and [`02-business-rules.md`](../standards/02-business-rules.md): the domain-owned assets and their metadata.
