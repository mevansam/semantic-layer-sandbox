# ADR-0010: ADRs only for rules that bind domains; every rule links to its decision

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Semantic review board

## Context
ADRs had been written for every notable change, including tooling, a folder rename and a superseded stop-gap. Many also restated rules that live in the standards, so the two could disagree. Nothing connected a rule to the decision behind it. A domain author whose change failed a check could not find out why the rule existed, so the records were rarely read.

## Decision
- **Scope.** An ADR is required only for a change that binds domains:
  - an enterprise rule (gate, extension rule, drift check, change-class rule, review rule)
  - a meta-shape
  - the repository structure standard
  - an AI control
  - a template change every sub-domain must follow

  Everything else is recorded in commit messages and `CHANGELOG.md`.
- **Content.** An ADR records the reasoning and the rejected alternatives. It points to the standard that defines the rule; it does not restate it.
- **Links.**
  - Enterprise rules are catalogued as RDF in `standards/enterprise-rules.ttl`.
  - Each rule, and each meta-shape, names its standard (`ent-gov:definedIn`) and at least one ADR (`ent-gov:justifiedBy`). Standards adopted with the baseline without a record of their own are covered by a baseline ADR (ADR-0011), so every rule has a decision behind it.
  - The decision register is generated from the ADR files (`semtool decisions`).
- **Checks.**
  - A meta-shape (G2) requires every enterprise rule to name a decision, and every link to name an existing, Accepted decision.
  - D9 requires the register to be current.
  - D11 requires every referenced standard to exist and every meta-shape to name a decision, and warns about Accepted decisions that no rule cites.
- **Retired records.** ADRs 0003, 0008 and 0009 were history, not decisions; they are retired to `CHANGELOG.md`. Numbers are never reused.

## Why
- An ADR earns its keep when someone needs it: to accept a rule, to challenge it, or to change it without repeating the original debate. That happens for rules that bind domains, not for tooling or renames.
- A link from the rule is how people find the reasoning: in a check message, on the rule's page in Semantic Studio, or in a SPARQL query. Without the link, a record exists but goes unread.
- Generating the register from the files, and checking the links, keeps the decisions and the rules from drifting apart, as ADR-0006 does for other repeated facts.

## Alternatives rejected
- **Keep writing ADRs for every notable change.** Rejected: the decisions that matter get lost among change notes.
- **Drop ADRs and add a rationale section to each standard.** Rejected: it loses the record of rejected alternatives, and the requirement to write the reasoning down before a binding rule changes.
- **Link decisions to rules from the ADR side.** Rejected: a rule is what people meet first, and a rule can be justified by several decisions.

## Where the rules are
- [`docs/adr/README.md`](README.md): when an ADR is required, and how to write and link one.
- [`standards/enterprise-rules.ttl`](../../standards/enterprise-rules.ttl): the rule catalogue and its links.
