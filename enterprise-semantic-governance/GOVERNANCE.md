# Governance operating model

> **Principle.** Business domains are accountable for **meaning, rules, data, records and APIs**.
> The enterprise governs how that knowledge is **represented, shared and consumed by AI**.

This file is the human-readable form of `ontology/governance.ttl`. When they disagree, the ontology wins.

## The three pillars

| Pillar | Accountable for | Owned where | Enforced by |
|---|---|---|---|
| **Enterprise governance** | Ontology standards · Semantic review · AI risks & controls · Cross-domain alignment | this repo | meta-shapes, CI gates, review board |
| **Domain ownership** | Business ontologies · Business rules · Domain APIs · Data stewardship · Record keeping | each domain repo (from `domain-template`) | domain manifest, CODEOWNERS |
| **Semantic fabric** | Governed knowledge collections · Knowledge graph management · Reusable semantic assets · Published execution models | this repo (`fabric/`) + each domain's `collections/` and `execution-models/` | publication gate, retrieval contract |

## Accountability matrix (RACI)

R = responsible, A = accountable, C = consulted, I = informed.

| Asset / decision | Domain owner | Rule owner | API owner | Data steward | Records owner | Semantic review board | AI risk office | Fabric platform |
|---|---|---|---|---|---|---|---|---|
| Meaning of a domain term | **A** | C | C | C | I | C (representation) | I | I |
| Business rule (statement + shape) | A | **R** | I | C | I | C (representation) | C if in an execution model | I |
| Domain API contract + semantic annotation | A | I | **R** | C | I | C | I | I |
| Data product / critical data element | A | C | C | **R** | I | C | I | I |
| Record class + retention | A | I | I | C | **R** | C | I | I |
| Ontology standards, meta-shapes | I | I | I | I | I | **A/R** | C | C |
| Cross-domain alignment decision | C (each domain) | C | I | I | I | **A/R** | I | I |
| AI risk assessment, control catalog | C | C | I | I | I | C | **A/R** | C |
| Knowledge collection release | **A** | I | I | R | I | C | C (approves risk) | R (publishes) |
| Execution model release | **A** | R (source rules) | I | I | I | C | **A** (risk) | R (publishes) |

## Two-key review

Every change to a domain repository needs **two approvals**, generated into `CODEOWNERS` from the domain manifest:

1. **Domain key**: the relevant domain role (owner, rule owner, API owner, steward or records owner) approves the *meaning*.
2. **Enterprise key**: the semantic review board approves the *representation*: standards conformance, FIBO usage, alignment impact.

Collections and execution models also need the **AI risk office** and the **fabric platform** team.

The enterprise key never changes what a term means. If the representation cannot express the intended meaning, the board raises an ADR here instead of editing the domain's content.

## Release gates (CI, all mandatory)

| Gate | Check | Command |
|---|---|---|
| G1 Syntax | all RDF parses | `semtool syntax` |
| G2 Standards | meta-shapes (headers, definitions, naming, taxonomy anchoring, FIBO parentage, manifest completeness, rule metadata, record classes, collections, execution models) | `semtool meta` |
| G3 FIBO extension rules | no FIBO redefinition; namespace registered; imports within the enterprise FIBO profile | `semtool extensions` |
| G4 Logical coherence | import closure with FIBO classifies with no unsatisfiable classes | `semtool closure && semtool reason` |
| G5 Business rules | positive examples conform; negative examples trip the expected rules | `semtool rules` |
| G6 Competency | competency questions answer over the assembled knowledge graph | `semtool cq` |
| G7 Publishable | knowledge graph assembles; GraphRAG cards export | `semtool kg && semtool cards` |

## Change classes

| Class | Examples | Version bump | Review |
|---|---|---|---|
| Editorial | typo, better example | PATCH | two-key, fast path |
| Additive | new class, property, rule, API mapping | MINOR | two-key |
| Breaking | removed or renamed term, narrowed rule, changed parent | MAJOR | two-key + ADR + consumer impact note |
| Enterprise standard change | new meta-shape, new control | MINOR/MAJOR in this repo | review board + ADR, announced to all domains |
