# ADR-0005: Business domains split into sub-domains; IRIs follow the folder layout

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** Semantic review board, Retail Wealth Management owners consulted

## Context
One business domain can hold several separately owned bodies of meaning. In Retail Wealth Management, the plan (goals, scenarios, projections) and what we tell the customer about it (insights, health scores, the advice boundary) have different owners. The capability map stops at business domains, and its ontology-domain grouping is unreliable (ADR-0004), so neither can define ownership boundaries or IRIs.

## Decision
- **Layout.** `domains/<business-domain>/<sub-domain>/`. The sub-domain is the unit of ownership: its own manifest, CODEOWNERS, rules, APIs, data, records, collection and execution models, generated from the domain template.
- **Parent layer.** The business domain has an umbrella ontology that imports each sub-domain's published module, and a parent manifest naming its owner. Reasoning over the umbrella checks that the sub-domains cohere.
- **One-way extension point.** A sub-domain builds on another only by importing its **published** module. The dependency is declared in the configuration and the manifest. There are no cycles, and no sub-domain mints terms in another's namespace.
- **IRIs follow folders:** `{base}domain/{business-domain}/{sub-domain}/{module}/`. The ontology domain is metadata, not part of the IRI.
- **Identifiers per sub-domain:** rule IDs, tool names and graph names carry the sub-domain's code.

## Why
- Ownership must be where the meaning is decided. A business domain is often too coarse, and each sub-domain gets its own approvals and release cadence.
- The umbrella lets the business-domain owner settle overlaps between sub-domains before they become enterprise alignment questions.
- Importing only published modules gives each sub-domain a contract it can version, and stops coupling to work in progress.
- Deriving IRIs from folders (not from the capability map) means a regrouping of the map never changes an IRI. The folder, the namespace and the registry entry can be checked against each other (G8).

## Alternatives rejected
- **One repository per business domain.** Rejected: it mixes owners who should approve different changes.
- **IRIs from the capability map's ontology domains.** Rejected: the grouping is unreliable, and every regrouping would break IRIs.
- **Free imports between sub-domains.** Rejected: cycles, and coupling to unpublished terms.

## Where the rules are
- [`standards/domain-repo-structure.yaml`](../../standards/domain-repo-structure.yaml): the repository structure (G1).
- [`docs/standards/01-ontology-standards.md`](../standards/01-ontology-standards.md) §2 and §5: IRIs, namespaces and modularity.
- [`fibo-extensions/docs/registering-a-domain.md`](../../../fibo-extensions/docs/registering-a-domain.md): the registry and published modules (E2, E3).
