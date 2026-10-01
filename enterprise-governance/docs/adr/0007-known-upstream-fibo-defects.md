# ADR-0007: Known defects in the pinned FIBO/OMG release are patched out of the build closure only

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Semantic review board
- **Change class:** Enterprise standard (additive)

## Context
Gate G4 reasons over the import closure: our modules, enterprise core, the enterprise FIBO profile, and FIBO's own dependencies (OMG Commons and LCC). With OMG Commons present, ELK reported an unsatisfiable property that belongs to FIBO itself:
- `fibo-be-oac-exec:hasVestedInIt` has domain `cmns-ba:LegallyDelegatedAuthority`, which is a role.
- It is a sub-property of `fibo-fnd-law-lcap:hasCapacity`, whose domain is `cmns-pts:Party`.
- Commons declares `Party` disjoint with `Role`.

So every verification failed on a defect we neither own nor may change (rule E1: FIBO is read-only). Without Commons the disjointness is absent, which is why the defect had not shown up before.

Two options were rejected:
- Turning reasoning off, or downgrading every unsatisfiable FIBO term to a warning, would also hide problems our extensions cause.
- Editing FIBO would break E1 and every future upgrade.

## Decision
1. **Register.** Known upstream defects are listed in `fibo-extensions/profile/upstream-issues.yaml`, one entry per defect. Each entry has its evidence, the resolution, the upstream report, and the exact axiom(s) to remove.
2. **Build closure only.** `semtool closure` removes those axioms from `build/closure.ttl` and reports which entries it applied. `vendor/` is never modified, and everything else in FIBO is still reasoned over.
3. **Tied to the FIBO release.** The register records `fibo_release`. `make drift` (D10) fails when it differs from `fibo.release_tag`, so every entry must be re-validated on each FIBO upgrade.
4. **Stale entries.** An entry whose axiom is no longer in the closure is reported as stale (likely fixed upstream) and should be removed.
5. **Guidance on failure.** When `reason` fails only on FIBO/OMG terms, it says so and points to this process. When it fails on enterprise or domain terms, it points to our own axioms.
6. **Governance.** Changes to the register need semantic review board approval. Each defect is also reported to the EDM Council.

D10 also now compares the FIBO checkout with the commit of the release tag (`make` fetches the tag) instead of only warning when no tag is present.

## Consequences
- UP-001 (`hasVestedInIt`) is the first entry: its `rdfs:subPropertyOf hasCapacity` link is removed. With that change the closure classifies with ELK and HermiT, verified on the full closure with OMG Commons/LCC present.
- Builds with and without the OMG download now give the same G4 result.
- The self-test has a scenario that changes the FIBO release without re-validating the register.

## Alternatives considered
- **Downgrade unsatisfiable external terms to warnings.** Rejected because it hides real problems: an enterprise or domain class that uses such a term would still be caught, but the reasoner would stop classifying and produce no `reasoned.ttl`.
- **Pin an older OMG Commons release.** Rejected for now: OMG publishes unversioned IRIs, FIBO imports the latest, and the defect sits in FIBO's axioms.
