# ADR-0006: Consistency gate G8 and pull-request change-class check (no drift)

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Semantic review board, ontology standards team
- **Change class:** Enterprise standard (additive: new gate; no domain content changes required)

## Context
Federation (ADR-0002, ADR-0005) means some facts must be stated in more than one place:
- A sub-domain's identity is its folder, and it also appears in `semantic.yaml`, the registry, the manifest, the template answers and the capability map.
- A dependency is declared in `semantic.yaml` and in the manifest, and implemented as `owl:imports`.
- A collection's version appears in every graph name.
- Generated files (taxonomy, capability map, CODEOWNERS) repeat their sources.

Gates G1–G7 validated each file on its own terms, but did not check that these repetitions agree. The rename of *Planning and Guidance* to *Financial Planning* showed the risk: many files had to change together, and a missed one would have gone unnoticed. The first run of the new check found such a case already in the repository: the Insights and Analytics manifest did not declare its `assessments` module.

Nothing enforced the change classes in `GOVERNANCE.md` either. A module could change without a version bump, so one `owl:versionIRI` or graph name could carry two different contents. Two tooling gaps added to the risk:
- `semtool rebase --all` only reached top-level folders, so it missed nested sub-domains and the template.
- The reusable per-repository workflow assumed a side-by-side layout that sub-domains no longer have.

## Decision
1. **Gate G8, `semtool drift`**, runs in `verify` for every repository kind. It checks that every repeated fact agrees:
   - D1 version IRIs
   - D2 identity
   - D3 modules
   - D4 dependencies
   - D5 collections and graph names
   - D6 parent layer
   - D7 registry
   - D8 alignment and enterprise core
   - D9 generated files (regenerated in a scratch copy and compared)
   - D10 FIBO pin

   The fact inventory and codes are in `docs/framework/07-change-management.md` §7.2–7.3.
2. **`semtool changes --base <ref>`** runs on every pull request (`make changes`). It checks three things:
   - Each changed module bumps its version by at least its change class. The class is detected from the RDF diff: removed terms or changed parents are breaking; added terms are additive; changed constraints, including inside rule shapes, are at least MINOR; annotation-only changes are PATCH. While the version is `0.y.z`, breaking changes may bump MINOR.
   - A changed collection source bumps the collection version.
   - A change to `shapes/` or `standards/` comes with an ADR.

   Findings on **Release** content fail CI. Findings on **Provisional** content are warnings unless `--strict` is set.
3. Supporting checks are tightened:
   - `semtool structure` fails when a negative-test file is not listed in `expectations.yaml`.
   - `SubDomainDependencyShape` detects dependency cycles of any length. `meta` loads manifests of all transitive dependencies.
   - E3 rejects a sub-domain or business domain importing an ontology-domain umbrella.
   - `make align` fails when a template-owned file of a sub-domain differs from the template.
4. `semtool rebase --all` rewrites every repository, sub-domain, business domain and the domain template, at any depth.
5. The reusable workflow takes a `path` input, so a split-out sub-domain is checked out where it sits in the monorepo layout. Cross-repository checks (D6–D9) need the monorepo layout. With separate repositories they run in an integration job.

## Consequences
- The Insights and Analytics manifest now declares both its modules (`insights`, `assessments`).
- The Financial Planning and Insights and Analytics `collections.ttl` each held a stray duplicate block: 8 partitions attached to the risk assessment, and a second policy definition. It has been removed; each collection has one policy and 8 partitions.
- CI runs `make verify` (now G1–G8) and, on pull requests, `make changes BASE=origin/<base>`. The checkout uses `fetch-depth: 0`.
- Every check is mutation-tested by `tools/tests/selftest.py` (`make selftest`, run in CI). It seeds 30 defects, each of which must be caught by the intended check, plus one correct change that must pass.
- Domains need no content changes. Unversioned edits to Provisional content produce warnings until the content is released.

## Alternatives considered
- **Generate every repeated fact from one file** (for example, derive the manifest namespace from the folder). This was rejected for RDF facts: the repetitions exist so that each file is self-describing in the knowledge graph. Generation is used where the repeated file is not RDF the domain edits (CODEOWNERS, taxonomy, capability map).
- **SHACL meta-shapes for all consistency checks.** This was rejected: most checks span the file system, git and several repositories, which SHACL over one data graph cannot see. Checks that fit in one graph (for example, dependency cycles) remain meta-shapes. This ADR changes `SubDomainDependencyShape`, a standard change, which is why it is an ADR.
