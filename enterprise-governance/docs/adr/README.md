# Architecture decision records

An ADR records **why** a rule that binds domains exists, and which alternatives were rejected. It is the reference for anyone who has to accept, apply or challenge that rule. The rule itself lives in a standard; the ADR does not restate it.

## When an ADR is required

Write an ADR when a change **binds domains**, that is, when it adds, changes or removes:
- an enterprise rule in `standards/enterprise-rules.ttl` (a gate, an extension rule, a drift check, a change-class rule, a review rule)
- a meta-shape (`shapes/`) or the domain repository structure standard (`standards/`)
- an AI control (`ontology/controls.ttl`)
- the domain template, in a way every sub-domain must follow

`semtool changes` fails a pull request that changes `shapes/` or `standards/` without an ADR.

Everything else goes in the commit message and, if people need to know about it, in [`CHANGELOG.md`](../../../CHANGELOG.md). That covers tooling, renames, documentation, fixes, and domain content (domains record their own reasoning in `docs/modeling-notes.md`).

The test is simple: **would a domain team or a reviewer need to know why this rule exists in order to accept or challenge it?** If not, it is not an ADR.

## How decisions link to rules

Every enterprise rule and meta-shape names the ADR that justifies it with `ent-gov:justifiedBy`, in [`standards/enterprise-rules.ttl`](../../standards/enterprise-rules.ttl). It also names the standard that defines it, with `ent-gov:definedIn`.
- **The register.** `semtool decisions` generates the decision register, [`standards/decision-register.ttl`](../../standards/decision-register.ttl), from the files in this folder. `make drift` (D9) fails if the register is out of date.
- **What the checks enforce.**
  - Meta-shapes (G2) require every link to point at an **Accepted** decision. A superseded decision forces its rules to be re-linked.
  - Drift (D11) checks that every `definedIn` document exists, and warns about an Accepted decision that no rule cites.
- **Where to see the links.** Semantic Studio shows them both ways: on a rule's page, *why*; on a decision's page, *which rules*.

## Writing one

1. Copy [`0000-template.md`](0000-template.md) to the next free number. Numbers are never reused.
2. Keep it short: context, decision, why, alternatives rejected, where the rules are.
3. In the same pull request:
   - link the rules it justifies (`ent-gov:justifiedBy`)
   - run `make decisions` to regenerate the register, then `make verify`
4. To change a decision, write a new ADR that supersedes it. Set the old one's status to `Superseded by ADR-NNNN`, and re-link its rules.

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-fibo-upper-ontology.md) | FIBO is the enterprise upper ontology, consumed read-only and pinned | Accepted |
| [0002](0002-two-key-review.md) | Domains own meaning; the enterprise owns representation (two-key review) | Accepted |
| [0004](0004-curated-capability-map.md) | The capability map is imported through reviewed curation rules | Accepted |
| [0005](0005-business-domains-and-sub-domains.md) | Business domains split into sub-domains; IRIs follow the folder layout | Accepted |
| [0006](0006-consistency-gate-and-change-classes.md) | Repeated facts must agree (G8), and versions must follow change classes | Accepted |
| [0007](0007-known-upstream-fibo-defects.md) | Known FIBO/OMG defects are removed from the build closure only | Accepted |
| [0010](0010-decision-records-and-rule-links.md) | ADRs only for rules that bind domains; every rule links to its decision | Accepted |

Numbers 0003, 0008 and 0009 are retired. They recorded build history (a provisional capability map, Semantic Studio, a folder rename), which is now in [`CHANGELOG.md`](../../../CHANGELOG.md).
