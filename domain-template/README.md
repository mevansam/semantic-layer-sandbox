# Domain template

A [Copier](https://copier.readthedocs.io) template for a business (sub-)domain's semantic repository. Every domain gets the same structure for its five accountabilities (meaning, rules, APIs, data, records) and its semantic-fabric artefacts (knowledge collection, execution models). It passes the enterprise CI gates as soon as it is generated.

## Create a domain

1. Register the domain's namespace in `fibo-extensions/registry` (see `fibo-extensions/docs/registering-a-domain.md`). The (sub-)domain must exist in the capability map.
2. Generate the repository, either way:
   ```bash
   copier copy domain-template ../my-domain                                  # interactive, Copier >= 9
   python scripts/new_domain.py --answers my-answers.yaml --out ../my-domain  # no Copier needed
   ```
   `answers/rwpa-sdp.yaml` is a worked example (it created `rwpa-self-directed-planning`).
3. `cd ../my-domain && python ../enterprise-semantic-governance/tools/semtool.py codeowners --repo . && … verify --repo .`
4. Replace the seed concept with real modelling.

## Keep domains current

Template improvements reach existing domains with `copier update`, since `.copier-answers.yml` is written into each generated repository.

## What the template contains

```
template/
├── domain-manifest.ttl.jinja            accountable roles → CODEOWNERS; taxonomy anchors; capabilities
├── semantic.yaml.jinja                  what lives where (read by semtool)
├── ontology/{{module_name}}.ttl.jinja   seed concept specializing FIBO
├── rules/business-rules.ttl.jinja       seed rule with id, statement, policy source, owner
├── processes/processes.ttl.jinja        seed process + step (rule, API, record links)
├── apis/                                OpenAPI with x-ontology-* + API registry
├── stewardship/                         data product (DCAT/DPROD) + critical data element
├── records/                             record class with retention and legal hold
├── mappings/                            RML mapping conventions
├── collections/                         knowledge collection, 8 named-graph partitions, ODRL policy, risk assessment
├── execution-models/                    query tool (SPARQL + JSON Schema) with risk assessment
├── competency-questions/                CQ-001 rules & owners, CQ-002 accountability, CQ-003 tool test
├── examples/, tests/negative/           positive and negative rule tests
└── .github/workflows/ci.yml.jinja       calls the enterprise reusable workflow
```

CI for this repository (`.github/workflows/template-test.yml`) generates a domain from `answers/rwpa-sdp.yaml` and runs every gate on it.
