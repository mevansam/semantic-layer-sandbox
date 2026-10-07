# ADR-0007: Known FIBO/OMG defects are removed from the build closure only

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Semantic review board

## Context
Gate G4 reasons over the import closure: our modules, enterprise core, the FIBO profile and FIBO's own dependencies (OMG Commons and LCC). A defect inside the pinned FIBO/OMG release can make that closure incoherent. The first was `hasVestedInIt`, whose domain is a role while its parent property's domain is a party, and Commons makes the two disjoint. Then every verification fails on something we neither own nor may change (ADR-0001: FIBO is read-only).

## Decision
- **A register.** Known upstream defects are listed in `fibo-extensions/profile/upstream-issues.yaml`, one per defect, each with:
  - its evidence and resolution
  - the upstream report
  - the exact axioms to remove
- **Build closure only.** Those axioms are removed from the build closure, never from the FIBO checkout. Everything else in FIBO is still reasoned over.
- **Tied to the FIBO release.** The register names the release it was validated against. A FIBO upgrade must re-validate every entry. An entry whose axiom is gone is reported as stale and removed.
- **Reviewed and reported.** Changes to the register need semantic review board approval, and every defect is reported to the EDM Council.

## Why
- Every failure must be either ours to fix, or a known, reviewed upstream defect. Otherwise people learn to ignore G4.
- Removing exact axioms, rather than ignoring whole terms, keeps reasoning complete for everything else. A domain class that depends on a broken term is still caught.
- Tying entries to a release keeps workarounds from outliving the defect they cover.

## Alternatives rejected
- **Turn reasoning off, or downgrade unsatisfiable FIBO terms to warnings.** Rejected: it hides problems our own extensions cause, and the reasoner stops producing a classification.
- **Patch FIBO in the checkout.** Rejected: it breaks ADR-0001 and every upgrade.
- **Pin an older OMG Commons.** Rejected: OMG publishes unversioned IRIs, FIBO imports the latest, and the defect sits in FIBO's own axioms.

## Where the rules are
- [`fibo-extensions/profile/upstream-issues.yaml`](../../../fibo-extensions/profile/upstream-issues.yaml): the register and its rules (header).
- [`fibo-extensions/docs/upgrading-fibo.md`](../../../fibo-extensions/docs/upgrading-fibo.md): re-validation on upgrade.
- [`fibo-extensions/docs/extension-rules.md`](../../../fibo-extensions/docs/extension-rules.md): the one governed exception to E1.
