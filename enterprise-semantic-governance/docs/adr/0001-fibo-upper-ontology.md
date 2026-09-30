# ADR-0001: FIBO is the enterprise upper ontology, consumed read-only and pinned

- **Status:** Accepted (baseline)
- **Date:** 2026-09-28
- **Change class:** Enterprise standard

## Context
We need one shared conceptual foundation for financial-services meaning that is open, maintained and widely understood. FIBO (EDM Council, MIT licence) covers parties, agreements, accounts, products, securities, goals and analytics.

## Decision
1. FIBO is the upper ontology for every business class (meta-shape `BusinessClassShape`).
2. FIBO is consumed **read-only** as a git submodule in `fibo-extensions/vendor/fibo`, pinned to a production release tag (currently `master_2026Q2`). It is never forked or edited (rule E1).
3. The enterprise adopts an explicit **FIBO profile** (a subset of modules). Domains may import only profile modules (rule E3).
4. FIBO's own dependencies (OMG Commons and LCC) are fetched at build time by `fibo-extensions/scripts/fetch-omg-dependencies.sh` (run automatically by `make`) and resolved through XML catalogs.
5. FIBO is upgraded at most quarterly through a PR that bumps the submodule and runs every domain's CI against it.

## Consequences
- Extension is by subclass or subproperty only. Where FIBO has gaps, we record `FIBO-GAP` notes and contribute upstream.
- Reasoning uses the import closure of the profile, not all of FIBO, which keeps CI fast.
