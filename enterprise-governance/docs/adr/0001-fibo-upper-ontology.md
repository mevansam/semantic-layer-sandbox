# ADR-0001: FIBO is the enterprise upper ontology, consumed read-only and pinned

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Semantic review board

## Context
Many independent domains need one shared foundation for financial-services meaning: parties, agreements, accounts, products, securities, goals and analytics. Without one, each domain invents its own and AI agents get several meanings for the same thing.

## Decision
- FIBO (EDM Council) is the upper ontology. Every business class specialises FIBO or enterprise core.
- FIBO is consumed **read-only**, pinned to a production release. Nobody adds statements about FIBO terms.
- The enterprise adopts an explicit **profile**, a list of FIBO modules. Domains import only those.
- FIBO is upgraded deliberately, at most quarterly, with every domain re-verified against the new release.

## Why
- FIBO is open (MIT), maintained by an industry body, and already covers most of what our domains need. Building our own upper ontology would take years and would not be recognised outside the enterprise.
- Read-only keeps FIBO meaning FIBO: upgrades don't conflict with our edits, and an agent sees one meaning per FIBO term.
- A profile limits the reasoning footprint and keeps CI fast, and makes "which parts of FIBO do we depend on" a reviewed list.
- Pinning makes every build reproducible; an upgrade is a visible change that every domain is tested against.

## Alternatives rejected
- **An enterprise upper ontology of our own.** Rejected: too costly, and not shared with the industry.
- **Fork FIBO and edit it.** Rejected: every upstream release becomes a merge, and meanings drift from the published FIBO.
- **Import all of FIBO.** Rejected: reasoning time and coupling grow with modules nobody uses.
- **Follow FIBO's latest master.** Rejected: builds would change without any change of ours.

## Where the rules are
- [`fibo-extensions/docs/extension-rules.md`](../../../fibo-extensions/docs/extension-rules.md): E1–E5.
- [`docs/standards/01-ontology-standards.md`](../standards/01-ontology-standards.md) §1: the business class standard.
- [`fibo-extensions/docs/upgrading-fibo.md`](../../../fibo-extensions/docs/upgrading-fibo.md): upgrades.
