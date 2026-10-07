# ADR-0006: Repeated facts must agree (G8), and versions must follow change classes

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Semantic review board, ontology standards team

## Context
Federation means some facts are stated in more than one place. A sub-domain's identity appears in its folder, configuration, registry entry, manifest, template answers and the capability map. A dependency is declared twice and implemented as an import. A collection's version is part of every graph name. Generated files repeat their sources.

Gates G1–G7 checked each file on its own terms, not that the repetitions agree. Nothing enforced the change classes either, so one version IRI or graph name could carry two different contents.

## Decision
- **Gate G8.** It checks that every repeated fact agrees, and that every generated file equals a fresh regeneration. It runs for every repository in `make verify` and CI.
- **The change-class check.** It runs on every pull request:
  - Each changed module bumps its version by at least the class of its change, detected from the RDF diff.
  - Changed knowledge bumps its collection's version.
  - A change to an enterprise standard comes with an ADR.
- **Release and Provisional.** Findings fail CI for Release content. They are warnings for Provisional content until it is released.
- **Mutation testing.** Every check is tested by seeding the defect it should catch (the self-test).

## Why
- Each repetition exists so that every file describes itself in the knowledge graph. Checking the repetitions keeps that benefit without the drift.
- A version must identify one content. Otherwise agents and consumers can't trust a citation or a cached graph.
- A check nobody has seen fail may not work. Mutation testing proves that each check catches what it claims to.

## Alternatives rejected
- **Generate every repeated fact from one file.** Rejected for RDF facts: self-describing files are the point. Generation is used where the copy isn't RDF that a domain edits (CODEOWNERS, taxonomy, capability map).
- **Express all consistency checks as SHACL meta-shapes.** Rejected: most checks span the file system, git and several repositories, which SHACL over one graph cannot see. Checks that fit in one graph stay meta-shapes.
- **Rely on review alone.** Rejected: the drift found when this was introduced had passed review.

## Where the rules are
- [`docs/framework/07-change-management.md`](../../../docs/framework/07-change-management.md) §7.2–7.5: where every fact lives, the checks (D1–D11), and versions.
- [`GOVERNANCE.md`](../../GOVERNANCE.md): change classes.
- [`docs/framework/08-validation-tooling.md`](../../../docs/framework/08-validation-tooling.md): `drift`, `changes` and the self-test.
