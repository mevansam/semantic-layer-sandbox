# FIBO Extensions

The enterprise's governed use of FIBO, and the mechanism through which business domains extend it.

| Path | What | Owner |
|---|---|---|
| `vendor/fibo/` | **FIBO, read-only**: git submodule pinned to `master_2026Q2` | EDM Council (upstream) |
| `vendor/omg/` | FIBO's OMG Commons and LCC dependencies, fetched by `scripts/fetch-omg-dependencies.sh` | OMG (upstream) |
| `profile/enterprise-fibo-profile.ttl` | **Enterprise FIBO profile**: the FIBO modules the enterprise adopts. Domains may import only these. | semantic review board |
| `ontology/core/` | **Enterprise core**: FIBO specializations shared by several domains (each with one owning domain) | semantic review board hosts; owning domain decides meaning |
| `ontology/alignment/` | Cross-domain alignment axioms (implements decisions from the governance alignment register) | semantic review board |
| `ontology/ontology-domains/` | One umbrella ontology per capability-map ontology domain, importing its domains' published modules | semantic review board |
| `registry/domain-registry.ttl` | **Domain registry**: reserved namespaces `{base}domain/{business-domain}/[{sub-domain}/]` (following the folder layout, ADR-0005), domain codes, repositories, published modules | semantic review board |
| `docs/` | Extension rules, registering a domain, upgrading FIBO | |

## Setup and validation

Fetching FIBO and its OMG dependencies, and validating this folder, are covered in the [root README](../README.md#run-validate-and-test).

## How extension works

```
FIBO module (read-only, pinned) ──imported by──▶ enterprise FIBO profile
                                                     │ imported by
                                                     ▼
             enterprise core (shared terms) ◀── domain ontology modules (each domain repo)
                                                     │ subclass / subproperty only
                                                     ▼
                                       domain rules, APIs, records, collections…
```

The rules are enforced by `semtool extensions` and the meta-shapes. Details are in `docs/extension-rules.md`:

- **E1**: never make statements about FIBO or OMG terms; extend by subclass or subproperty only.
- **E2**: mint IRIs only inside your registered namespace.
- **E3**: import only profile modules, enterprise modules, and other domains' *published* modules.
- **E4** (meta-shape): every business class has a FIBO or enterprise parent and a taxonomy anchor.

To create a new domain, see `docs/registering-a-domain.md`, then scaffold it from `domains/domain-template`. How these files link to the rest of the repository, and how to change them without drift, is in `docs/framework/` at the repository root (documents 3, 6 and 7).
