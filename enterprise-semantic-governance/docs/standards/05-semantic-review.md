# 05 · Semantic review

Owner: semantic review board (`@example-org/semantic-review-board`).

## What the board reviews (representation) and what it does not (meaning)

| The board checks | The board does **not** decide |
|---|---|
| Conformance to standards 01–08 (CI gates G1–G7 are necessary, not sufficient) | Whether a definition is *correct* for the business |
| Correct FIBO parent choice and absence of FIBO duplication | Business rule thresholds and policy |
| Impact on other domains, and whether an alignment decision is needed | API product decisions |
| Modularity, naming, reuse of fabric assets | Retention periods (records owner plus Legal) |
| That agent-facing text (`agentGuidance`, `sh:message`) is safe and unambiguous | |

## Checklist (copy into the PR)

- [ ] CI gates G1–G7 green
- [ ] New classes have the closest correct FIBO parent; any FIBO gaps noted with `FIBO-GAP`
- [ ] No term duplicates an enterprise-core or other-domain term (search the KG); an alignment decision is recorded if terms overlap
- [ ] Rules have statement, policy source, owner and a negative test
- [ ] Collections and execution models have a sensitivity class, policy, controls and risk assessment
- [ ] Version bump matches the change class; breaking changes have an ADR

## Service levels (proposal)

- Editorial and additive changes: review within 3 business days.
- Breaking changes: review at the fortnightly board meeting, with an ADR.
