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
| Add a sub-domain | generate it from `domains/domain-template` (see [Create a sub-domain](../../README.md#create-a-sub-domain) in the root README) | Declare it in `capabilities/curation.yaml` (sub_domains) and register its namespace first |
| Build on another sub-domain | all three in the dependent sub-domain: `semantic.yaml` `dependencies`, manifest `ent-gov:dependsOnSubDomain`, and `owl:imports` of the other's **published** module | One direction only; no cycles (`ent-ms:SubDomainDependencyShape`); only published modules (rule E3); the three must agree (D4) |
| Publish a module | `fibo-extensions/registry` `ent-gov:publishedModule`, plus `owl:imports` here | Published modules are a contract: breaking changes need a MAJOR version |
| Share a term between sub-domains | the owning sub-domain publishes it; the other imports it | Never copy a term. If both need to own it, raise it with the business-domain owner |

Verifying this business domain checks the parent layer and reasons over all published sub-domain modules together with FIBO (see [Validate a business domain](../../README.md#validate-a-business-domain) in the root README). Its consistency check (D6) makes sure `semantic.yaml` `sub_domains`, the sub-domain folders, `includesSubDomain`, the capability map and the umbrella imports all agree. Step-by-step playbooks are in [`docs/framework/07-change-management.md`](../../docs/framework/07-change-management.md).
