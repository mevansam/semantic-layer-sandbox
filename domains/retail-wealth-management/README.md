# Retail Wealth Management

Business domain **Retail Wealth Management** (Investment Servicing ontology domain in the capability map). It is made up of sub-domains; each sub-domain folder is a domain repository generated from `domains/domain-template` and owns its own meaning, rules, APIs, data and records.

| Path | What | Owner |
|---|---|---|
| `domain.ttl` | Umbrella ontology (imports each sub-domain's published module) and parent manifest (business-domain owner, sub-domains) | business-domain owner |
| `semantic.yaml` | Lists the sub-domain folders (read by `semtool`) | business-domain owner |
| `<sub-domain>/` | One domain repository per sub-domain | sub-domain owners |

## Extension points

| Extension point | Where | Rule |
|---|---|---|
| Add a sub-domain | `python domains/domain-template/scripts/new_domain.py --answers … --out domains/retail-wealth-management/<sub-domain>` | Declare it in `capabilities/curation.yaml` (sub_domains) and register its namespace first |
| Build on another sub-domain | the sub-domain's `semantic.yaml` `dependencies` and `owl:imports` of the other's **published** module | One direction only; no cycles (`ent-ms:SubDomainDependencyShape`); only published modules (rule E3) |
| Publish a module | `fibo-extensions/registry` `ent-gov:publishedModule`, plus `owl:imports` here | Published modules are a contract: breaking changes need a MAJOR version |
| Share a term between sub-domains | the owning sub-domain publishes it; the other imports it | Never copy a term. If both need to own it, raise it with the business-domain owner |

`python enterprise-semantic-governance/tools/semtool.py verify --repo domains/retail-wealth-management` checks the parent layer and reasons over all published sub-domain modules together with FIBO.
