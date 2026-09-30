# Domain template

A [Copier](https://copier.readthedocs.io) template for a **sub-domain** repository: the unit of ownership inside a business domain (`domains/<business-domain>/<sub-domain>`). Every domain gets the same structure for its five accountabilities (meaning, rules, APIs, data, records) and its semantic-fabric artefacts (knowledge collection, execution models). It passes the enterprise CI gates as soon as it is generated.

## Create a domain

1. Declare the sub-domain in `enterprise-semantic-governance/capabilities/curation.yaml` (`sub_domains`) and register its namespace `{base}domain/<business-domain>/<sub-domain>/` in `fibo-extensions/registry` (see `fibo-extensions/docs/registering-a-domain.md`). The business domain must exist in the capability map (ADR-0004, ADR-0005).
2. Write an answers file (worked examples: `answers/rwm-fp.yaml`, `answers/rwm-ia.yaml`), generate the sub-domain, and verify it. The commands are in [Create a sub-domain](../../README.md#create-a-sub-domain) in the root README. Generation also scaffolds the business domain's parent layer from `parent-template/` if it doesn't exist yet.
3. Replace the seed concept, rule, tool and tests with real modelling, **keeping the file names** (see below).

## The structure every domain keeps

The template's structure is an enterprise standard (`enterprise-semantic-governance/standards/domain-repo-structure.yaml`), checked by `semtool structure` in every domain's CI (gate G1). The rule is simple: **edit the template's files in place, never rename or replace them; add files only where the naming conventions allow.**

```
template/                                           → generated domain repo
├── domain-manifest.ttl.jinja                       accountable roles → CODEOWNERS; taxonomy anchors; capabilities
├── semantic.yaml.jinja                             what lives where (read by semtool)
├── ontology/{{module_name}}.ttl.jinja              one file per ontology module (add more: ontology/<module>.ttl)
├── rules/business-rules.ttl.jinja                  rules {PREFIX}-R-NNN, each with statement, policy source, owner
├── processes/processes.ttl.jinja                   processes and steps (rules, APIs, records per step)
├── apis/api-registry.ttl.jinja                     API registry …
├── apis/{{module_name}}-api.openapi.yaml.jinja     … and one <name>-api.openapi.yaml per API
├── stewardship/data-products.ttl.jinja             data products (DCAT/DPROD) + critical data elements
├── records/record-classes.ttl.jinja                record classes: retention, legal hold, citation
├── mappings/README.md                              RML mappings: <source>.rml.ttl
├── collections/collections.ttl.jinja               knowledge collection, 8 named graphs, ODRL policy, risk assessment
├── execution-models/execution-models.ttl.jinja     every agent tool, with risk assessment; files named <toolName>:
│   ├── queries/<toolName>.rq                       query tools (SPARQL)
│   ├── schemas/<toolName>.schema.json              query-tool inputs (JSON Schema)
│   └── rulepacks/<toolName>.yaml                   rule packs (runtime rule checks)
├── competency-questions/                           cq-001…cq-005 from the template (edit in place):
│   ├── cq-001-rules-and-owners                     which rules govern the key concept, and who owns them
│   ├── cq-002-accountability                       who is accountable for meaning, rules, APIs, data, records
│   ├── cq-003-capability-governance                ontology domain, capabilities, accountability
│   ├── cq-004-fibo-grounding                       nearest FIBO parent of every class
│   ├── cq-005-query-tool                           the domain's query tool answers from the graph
│   └── cq-101…                                     domain-specific questions
├── examples/example-data.ttl.jinja                 positive examples (must pass every rule)
├── tests/negative/expectations.yaml.jinja          negative cases: nc-NNN tests rule {PREFIX}-R-NNN;
│   └── nc-000-….ttl.jinja                          every rule needs at least one
├── docs/modeling-notes.md.jinja                    semantic review record: FIBO parents, rules↔tests↔tools, open items
└── .github/workflows/ci.yml.jinja                  calls the enterprise reusable workflow

parent-template/                                    → domains/<business-domain>/ (scaffolded once)
├── domain.ttl.jinja                                business-domain umbrella + parent manifest (owner, sub-domains)
├── semantic.yaml.jinja                             repo_kind: business-domain; lists sub-domain folders
└── README.md.jinja                                 extension points of the business domain
```

## Keep domains current

`copier update` applies template improvements to existing domains; `.copier-answers.yml` records how each was generated. Template-owned files (CI, `.gitignore`, `semantic.yaml`, mapping conventions) update automatically. Domain-owned content is listed in `_skip_if_exists` and is never overwritten; changes to it are described in the template's release notes and applied by the domain.

## Extension points

| Extension point | How |
|---|---|
| Build on another sub-domain | answer `dependencies` (path, capability IRI, published module): wires `semantic.yaml`, `ent-gov:dependsOnSubDomain` and `owl:imports` |
| Parent layer | `parent-template/`: business-domain umbrella + parent manifest; verifying the business domain reasons over all its sub-domains together |

CI generates both worked examples and runs every gate on them; how to run that yourself, and how to check a sub-domain's alignment with the template, is in the [root README](../../README.md#create-a-sub-domain).
