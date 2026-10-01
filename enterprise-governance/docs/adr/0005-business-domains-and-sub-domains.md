# ADR-0005: Business domains with sub-domains; IRIs follow the folder layout

- **Status:** Accepted
- **Date:** 2026-09-29
- **Change class:** Enterprise standard (breaking for unreleased domain IRIs)

## Context
Self-directed wealth planning outgrew a single domain repository. It has two clearly separable owners of meaning:
- **the plan**: goals, plans, scenarios, assumptions and projections
- **what we tell the customer about it**: insights, health scores and the advice boundary

Both belong to the **Retail Wealth Management** business domain. The capability map stops at business domains, and its ontology-domain grouping is unreliable (ADR-0004).

## Decision
1. **Layout.** `domains/<business-domain>/<sub-domain>/`. Each sub-domain is a domain repository generated from `domains/domain-template` and is the unit of ownership: it has its own manifest, CODEOWNERS, rules, APIs, data, records, collection and execution models. A business domain with no split still gets one sub-domain.
2. **Parent layer.** `domains/<business-domain>/` holds:
   - `domain.ttl`: an **umbrella ontology** importing each sub-domain's published module, plus an `ent-gov:ParentDomainManifest` naming the business-domain owner and its sub-domains
   - `semantic.yaml` (`repo_kind: business-domain`)

   `semtool verify` reasons over the umbrella, so the sub-domains are checked to cohere with each other and with FIBO. The business-domain owner settles overlaps between its sub-domains before they reach enterprise alignment.
3. **Sub-domains in the capability map.** Declared in `capabilities/curation.yaml` (`sub_domains`) and imported as `ent-gov:SubDomain` (`ent-gov:isSubDomainOf`). Capabilities can be accountable to a sub-domain.
4. **Extension point between sub-domains.** A sub-domain builds on another only by importing its **published** module:
   - `semantic.yaml` `dependencies`
   - `ent-gov:dependsOnSubDomain` in the manifest
   - `owl:imports`
   - the module is listed as `ent-gov:publishedModule` in the registry (rule E3)

   Dependencies run one way (`ent-ms:SubDomainDependencyShape` rejects cycles). A sub-domain never mints terms in another's namespace (E2). Its knowledge graph includes the dependency's published ontology, and in tests its example data.
5. **IRIs follow folders:** `{base}domain/{business-domain}/{sub-domain}/{module}/`. The ontology domain is metadata (`ent-gov:inOntologyDomain`), so re-grouping the map never changes IRIs. Ontology-domain umbrellas move to `{base}ontology-domain/{od}/`.
6. **Identifiers are per sub-domain:** rule IDs `FP-R-nnn` / `IA-R-nnn`, tool names `rwm_fp_*` / `rwm_ia_*`, graph names `graph/rwm-fp/…`.

## Consequences
- Retail Wealth Management is split into Financial Planning (`rwm-fp`, publishes `planning`) and Insights and Analytics (`rwm-ia`, builds on `rwm-fp`). Financial Plan Management no longer has a repository; it is again a capability gap in the map.
- The advice boundary (ALN-002) now runs inside Retail Wealth Management: the self-directed side is Insights and Analytics, and the advised side is a future advice sub-domain.
- The planning sub-domain is named **Financial Planning**, not "Planning and Guidance", so it cannot be confused with the capability map's ontology domain of that name. It is the sub-domain accountable for the proposed capabilities under "Financial Planning" (Goal-Based Planning, Retirement Income Projection).
