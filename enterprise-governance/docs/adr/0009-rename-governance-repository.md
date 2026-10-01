# ADR-0009: The governance repository is named `enterprise-governance`

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Semantic review board
- **Change class:** Enterprise structure (rename; no change to meaning)

## Context
The repository that holds enterprise standards, meta-shapes, AI controls, alignment, the taxonomy, the capability map, the semantic fabric and `semtool` was called `enterprise-semantic-governance`. The operating model calls this layer *enterprise governance*: it governs how knowledge is represented, shared and consumed by AI, and the semantic fabric is part of it. The longer name added nothing and made every path longer.

## Decision
- Rename the folder (and, in a split setup, the repository) to `enterprise-governance`.
- Update every reference in the same change:
  - the `governance:` path in each `semantic.yaml`
  - the domain template (`copier.yml` default, parent template, generated READMEs, CI and rule packs) and the generated sub-domains' copies and `.copier-answers.yml`
  - the reusable CI workflow and its callers
  - `make`, `semtool`'s self-test, Semantic Studio, and all documentation
- The repository's display name becomes *Enterprise governance*.

IRIs do not change: no IRI contains the folder name.

## Consequences
- In a split setup, the reusable workflow is now `example-org/enterprise-governance/.github/workflows/semantic-ci.yml`. Domain repositories generated earlier must update their `ci.yml`, `semantic.yaml` and `.copier-answers.yml`; `copier update` does it.
- `make changes` against a commit from before the rename lists the governance modules as new modules. This is expected for this one change.
- Reports and build output under the old folder are not carried over; run `make verify` again.
