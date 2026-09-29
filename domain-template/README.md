# Domain template

A [Copier](https://copier.readthedocs.io) template for a business domain's semantic repository. Every domain gets the same structure for its five accountabilities (meaning, rules, APIs, data, records) and its semantic-fabric artefacts (knowledge collection, execution models). It passes the enterprise CI gates as soon as it is generated.

## Create a domain

1. Register the domain's namespace in `fibo-extensions/registry` (see `fibo-extensions/docs/registering-a-domain.md`). The business domain must exist in the capability map under its ontology domain (ADR-0004).
2. Generate the repository, either way:
   ```bash
   copier copy domain-template ../my-domain                                  # interactive, Copier >= 9
   python scripts/new_domain.py --answers my-answers.yaml --out ../my-domain  # no Copier needed
   ```
   `answers/pg-fpm.yaml` is a worked example (it created `planning-and-guidance-financial-plan-management`).
3. `cd ../my-domain && python ../enterprise-semantic-governance/tools/semtool.py codeowners --repo . && … verify --repo .`
   Check alignment any time with `python scripts/compare_domain.py ../my-domain`.
4. Replace the seed concept, rule, tool and tests with real modelling, **keeping the file names** (see below).

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
```

## Keep domains current

`copier update` applies template improvements to existing domains; `.copier-answers.yml` records how each was generated. Template-owned files (CI, `.gitignore`, `semantic.yaml`, mapping conventions) update automatically. Domain-owned content is listed in `_skip_if_exists` and is never overwritten; changes to it are described in the template's release notes and applied by the domain.

CI for this repository (`.github/workflows/template-test.yml`) generates a domain from `answers/pg-fpm.yaml` and runs every gate on it.
