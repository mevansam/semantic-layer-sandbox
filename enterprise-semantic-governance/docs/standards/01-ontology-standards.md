# 01 · Ontology standards

Owner: Semantic review board. Enforced by: `shapes/meta-common.ttl`, `shapes/meta-business.ttl`, `semtool extensions`.

## 1. FIBO is the upper ontology

- Every business class specializes a FIBO class (or an enterprise-core class that does). Domain ontologies do not introduce other upper ontologies. See ADR-0001.
- Extend FIBO **only** by subclassing or subproperty. Never add statements whose subject is a FIBO or OMG IRI, including labels, definitions and axioms (rule E1).
- Only import FIBO modules adopted in `fibo-extensions/profile/enterprise-fibo-profile.ttl` (rule E3). To adopt another module, raise a PR against the profile.
- When no FIBO parent fits, use the closest one, record the gap with `skos:editorialNote "FIBO-GAP: ..."`, and raise it with the EDM Council through the review board.

## 2. IRIs and namespaces

| Kind | Pattern | Example |
|---|---|---|
| Enterprise meta-model | `{base}governance/{module}/` | `…/governance/model/` |
| Semantic fabric | `{base}fabric/{module}/` | `…/fabric/model/` |
| Taxonomy | `{base}taxonomy/{path}` | `…/taxonomy/customers.customer-profile` |
| Capability map | `{base}capability/{path}` | `…/capability/investment-management.portfolio-management` |
| Ontology / business domains | `{base}capability/ontology-domain/{od}`, `{base}capability/domain/{od}/{domain}` | `…/capability/domain/planning-and-guidance/financial-plan-management` |
| Enterprise FIBO extensions | `{base}fibo-ext/{module}/` | `…/fibo-ext/core/` |
| Domain modules | `{base}domain/{ontology-domain}/{business-domain}/{module}/` | `…/domain/planning-and-guidance/financial-plan-management/planning/` |
| Ontology-domain umbrella | `{base}domain/{ontology-domain}/` | `…/domain/planning-and-guidance/` |
| Knowledge-graph named graphs | `{base}graph/{publisher}/{collection}/v{semver}/{partition}` | see standard 08 |

- `{base}` is set once in `semantic.yaml` (`https://ontology.example.com/`, a neutral placeholder) and changed with `semtool rebase --to … --all`.
- Domain namespaces are **reserved** in `fibo-extensions/registry/domain-registry.ttl`. CI rejects IRIs minted outside the registered namespace (rule E2).
- IRIs are opaque and permanent. A renamed concept keeps its IRI; if the meaning changes, deprecate it with `owl:deprecated true` and `dct:isReplacedBy`.

## 3. Naming

- Classes: `UpperCamelCase` singular nouns (`FinancialGoal`).
- Properties: `lowerCamelCase` verb phrases (`hasTargetAmount`, `isFundedBy`).
- Labels: lower case unless a proper noun or acronym, as in FIBO (`financial goal`).

## 4. Required annotations (the annotation profile)

| Annotation | On | Required |
|---|---|---|
| `rdfs:label@en` | every term | ✔ |
| `skos:definition` (one, ISO 704 style: genus plus differentia) | every term | ✔ |
| `ent-av:governedBy` → taxonomy node | every business class, rule, API | ✔ |
| `rdfs:subClassOf` FIBO / enterprise | every business class | ✔ |
| `ent-av:agentGuidance` | business classes | recommended (warning) |
| `ent-av:businessExample` | business classes | optional |
| `ent-av:ruleIdentifier`, `ent-av:ruleStatement`, `ent-av:policySource` | business rules | ✔ |

## 5. Modularity

- One ontology module per cohesive topic (roughly 10–60 classes). Rules, processes, APIs, stewardship, records, collections and execution models live in **separate files**, never inside the ontology module. This keeps them out of OWL reasoning and gives each its own owner in CODEOWNERS.
- Every file has one `owl:Ontology` header with `rdfs:label`, `dct:abstract`, `owl:versionIRI`, a semantic-version `owl:versionInfo`, and a FIBO maturity level (`Release` / `Provisional` / `Informative`).

## 6. Versioning and maturity

- Semantic versioning per module (see the change classes in GOVERNANCE.md). `owl:versionIRI` = `{module IRI}{semver}/`.
- Maturity follows FIBO: **Provisional** while under design; **Release** when stable and used by an execution model or API; **Informative** for context-only content. Agents may be restricted to Release content by collection policy.
