# Framework guide

This guide explains how the enterprise semantic layer works as one system:
- how the enterprise governs it
- how independent business domains and sub-domains extend it without breaking each other
- how the semantic model and the ontology are managed
- how to change anything without drift

It is the entry point. The detailed rules live in the standards, ADRs and tool documentation it links to.

| # | Document | Read it to learn |
|---|---|---|
| 1 | [Overview](01-overview.md) | What the framework is, its layers, and how knowledge reaches an AI agent |
| 2 | [Enterprise governance](02-enterprise-governance.md) | Who decides what, the two-key review, the gates, AI risk and controls, alignment, ADRs, and governance encoded as files and checks |
| 3 | [Federated repository structure](03-federated-repository-structure.md) | How the repository layout lets independent domains and sub-domains keep one consistent enterprise ontology |
| 4 | [Semantic model and ontology](04-semantic-model-and-ontology.md) | What the semantic model is, how the ontology relates to it, and how each is managed at enterprise, domain and sub-domain level |
| 5 | [Logical model](05-logical-model.md) | Diagrams of the logical relationships: capability map, governance meta-model, domain assets, fabric, FIBO grounding, and the worked example |
| 6 | [Physical model](06-physical-model.md) | Diagrams of how the files are physically linked: `owl:imports`, IRI references, `semantic.yaml` wiring, build pipeline, generated files |
| 7 | [Change management without drift](07-change-management.md) | Where every fact is stated, what checks it, how versions work, and step-by-step playbooks for every kind of change |
| 8 | [Validation tooling reference](08-validation-tooling.md) | How to install and run the validation tools: every command and `make` target, outputs, CI, troubleshooting, the self-test, and how to extend the tooling |

## Reading paths

| You are… | Read |
|---|---|
| New to the framework | 1, then 4, then 5 |
| A domain or sub-domain owner, rule owner, API owner, data steward or records owner | 1, 3, 4, the playbooks in 7, and the recipes in 8 |
| On the semantic review board, in the AI risk office or on the fabric platform team | 2, 4, 7 |
| An engineer working on the tooling or CI | 6, 7, 8 |

## Vocabulary used throughout

| Term | Meaning here |
|---|---|
| **Ontology** | The OWL layer: classes, properties and axioms that state what things *mean*. FIBO, the enterprise core and each sub-domain's `ontology/*.ttl` modules. It is what the reasoner checks (gate G4). |
| **Semantic model** | Everything machine-readable that grounds an agent. It includes: <ul><li>the ontology</li><li>the enterprise reference vocabularies (taxonomy, capability map)</li><li>the governance meta-model</li><li>each domain's rules, processes, APIs, data products, record classes and manifest</li><li>the fabric packaging (collections, policies, execution models)</li></ul> See document 4. |
| **Ontology domain** | A named data ontology in the capability map, such as *Investment Servicing*, that groups business domains. It is metadata only: it never appears in a domain's IRIs. |
| **Business domain** | An accountable business area in the capability map, such as *Retail Wealth Management*. In the repo it is the parent layer `domains/<business-domain>/`. |
| **Sub-domain** | The unit of ownership and change, such as *Financial Planning*. Each one is a repository generated from `domains/domain-template` at `domains/<business-domain>/<sub-domain>/`. |
| **Published module** | A sub-domain ontology module listed as `ent-gov:publishedModule` in the domain registry. Only published modules may be imported by other sub-domains. |
| **Knowledge collection** | The versioned, policy-bound package of a sub-domain's knowledge. It is the only route to AI and is served as named graphs in the knowledge graph. |
| **Drift** | Two statements of the same fact that no longer agree: in two files, in a file and the code that generated it, or in the same versioned artefact carrying two different contents. |
