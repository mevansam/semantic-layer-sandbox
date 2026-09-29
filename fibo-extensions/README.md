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
| `registry/domain-registry.ttl` | **Domain registry**: reserved namespaces `{base}domain/{ontology-domain}/{business-domain}/`, domain codes, repositories, published modules | semantic review board |
| `docs/` | Extension rules, registering a domain, upgrading FIBO | |

## Setup

```bash
git submodule update --init --depth 1           # FIBO at the pinned tag
bash scripts/fetch-omg-dependencies.sh          # OMG Commons + LCC (needs www.omg.org)
python enterprise-semantic-governance/tools/semtool.py verify --repo fibo-extensions   # from the repository root
```

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

To create a new domain, see `docs/registering-a-domain.md`, then scaffold it from `domain-template`.
