# 6 · Physical model: how the files are linked

The logical model ([doc 5](05-logical-model.md)) is spread across many files in several folders. This document shows how those files are physically connected. There are five kinds of link, and each is resolved and checked differently:

| Link | Expressed as | Example | Resolved by | Checked by |
|---|---|---|---|---|
| **Import** | `owl:imports <module IRI>` in an ontology header | `insights.ttl` imports `…/financial-planning/planning/` | `semtool closure`: an IRI-to-file map built from every `owl:Ontology` header in the governance, FIBO extensions, own and dependency folders, plus FIBO and OMG XML catalogs | E3 (allowed targets), D4 (declared dependency), D6 (umbrella), G4 (coherence) |
| **Reference by IRI** | a term IRI used as the object of a triple, with no import | `sh:targetClass fp:FinancialGoal` in `rules/business-rules.ttl` | loading the files together (meta, rules, kg); by design, **not** by import, so rules, processes, APIs, data and records stay out of OWL reasoning | G2 meta-shapes (`sh:class`), G5, G6, G8 |
| **Configuration pointer** | relative paths and globs in `semantic.yaml` | `governance: ../../../enterprise-semantic-governance`, `dependencies: [../financial-planning]`, `paths.rules: [rules/*.ttl]` | `semtool` (`Repo` class) | D2, D4, D6 |
| **File pointer inside RDF** | a repository-relative path as a literal | `ent-fab:sourcePath "rules/*.ttl"`; `ent-fab:artifactPath`, `ent-fab:inputSchemaPath`; `ent-gov:apiSpecification` | `sourcePath`: `semtool kg` (partitions); `artifactPath` / `inputSchemaPath`: `semtool structure`; `apiSpecification`: documentation only, no command reads it | `sourcePath`: D5 (every partition matches files); `artifactPath` / `inputSchemaPath`: G1 `structure` (file exists and is named after the tool); `apiSpecification`: semantic review |
| **Generation** | a command that writes a file from sources | `curation.yaml` + CSV → `capability-map.ttl`; manifest → `CODEOWNERS` | `semtool taxonomy`, `capabilities`, `codeowners`; `new_domain.py` | D9 (generated files are current) |

## 6.1 The `owl:imports` graph

The actual import graph of the repository. Only ontology modules and umbrellas import. Rules, processes, APIs, stewardship, records, collections and execution models import nothing, and use terms by IRI instead.

```mermaid
flowchart BT
    subgraph FIBOV["fibo-extensions/vendor/fibo (read-only)"]
        FIBOM["12 FIBO modules<br/>FND: Objectives, Assessments, Analytics, CurrencyAmount,<br/>ProductsAndServices, People, FinancialDates, Reporting, Documents<br/>FBC: ClientsAndAccounts, FinancialProductsAndServices, FinancialInstruments"]
        OMG["OMG Commons + LCC<br/>(vendor/omg, fetched)"]
    end
    subgraph GOVR["enterprise-semantic-governance"]
        ANN["ontology/annotations.ttl<br/>governance/annotations/"]
        GOVM["ontology/governance.ttl<br/>governance/model/"]
        PROC["ontology/process.ttl<br/>governance/process/"]
        CTL["ontology/controls.ttl<br/>governance/controls/"]
        FABM["fabric/fabric.ttl<br/>fabric/model/"]
        ALR["alignment/alignment-register.ttl<br/>governance/alignment/"]
    end
    subgraph FXR["fibo-extensions"]
        PROF["profile/enterprise-fibo-profile.ttl<br/>fibo-ext/profile/"]
        CORE["ontology/core/enterprise-core.ttl<br/>fibo-ext/core/"]
        ALAX["ontology/alignment/alignment-axioms.ttl<br/>fibo-ext/alignment/"]
        REG["registry/domain-registry.ttl<br/>fibo-ext/registry/"]
        ODU["ontology/ontology-domains/investment-servicing.ttl<br/>ontology-domain/investment-servicing/"]
    end
    subgraph RWMR["domains/retail-wealth-management"]
        UMB["domain.ttl<br/>domain/retail-wealth-management/"]
        subgraph FPR["financial-planning"]
            FPO["ontology/planning.ttl<br/>…/financial-planning/planning/"]
            FPMAN["domain-manifest.ttl<br/>…/financial-planning/governance/"]
        end
        subgraph IAR["insights-and-analytics"]
            IAO["ontology/insights.ttl<br/>…/insights-and-analytics/insights/"]
            IAS["ontology/assessments.ttl<br/>…/insights-and-analytics/assessments/"]
            IAMAN["domain-manifest.ttl<br/>…/insights-and-analytics/governance/"]
        end
    end
    FIBOM --> OMG
    PROF --> FIBOM
    CORE --> PROF
    CORE --> ANN
    GOVM --> ANN
    PROC --> GOVM
    CTL --> GOVM
    FABM --> CTL
    FABM --> PROC
    ALR --> GOVM
    REG --> GOVM
    FPO --> CORE
    IAO --> CORE
    IAS --> CORE
    IAO -- "dependency<br/>(published module)" --> FPO
    FPMAN --> GOVM
    IAMAN --> GOVM
    UMB --> FPO
    UMB --> IAO
    ODU --> UMB
```

Three things to notice:

- `alignment-axioms.ttl` is **not imported** by any module. `closure` adds it, and enterprise core, as a root of every domain's closure, so alignment axioms constrain every domain whether or not the domain knows about them.
- `assessments.ttl` is not imported by the business-domain umbrella, because it is not a *published* module. It is incubated in insights-and-analytics and earmarked for Financial Assessments (`ent-av:owningDomain`), so it is reasoned only within its own sub-domain.
- Domains never import the ontology-domain umbrella. Consumers do. E3 rejects such an import from a sub-domain or business domain.

## 6.2 Inside a sub-domain: references by IRI

How the files of one sub-domain refer to each other, and to the enterprise, without imports. Financial Planning is the example. Every sub-domain generated from the template has the same files and the same links.

**(a) Knowledge files: everything points at the ontology module**

```mermaid
flowchart LR
    ONT(["ontology/planning.ttl<br/>fp:FinancialGoal, fp:GoalProjection, …"])
    RUL["rules/business-rules.ttl<br/>FP-R-001..004"]
    PRC["processes/processes.ttl<br/>GoalPlanningCycle"]
    APR["apis/api-registry.ttl<br/>PlanningApi"]
    OAS["apis/planning-api.openapi.yaml"]
    STW["stewardship/data-products.ttl<br/>GoalsAndPlans + CDEs"]
    RCD["records/record-classes.ttl<br/>PlanRecord"]
    EXA["examples/example-data.ttl"]
    NEG["tests/negative/<br/>expectations.yaml + nc-00n.ttl"]
    TAX["enterprise taxonomy"]
    CORE["enterprise core + FIBO"]
    RUL -. "sh:targetClass, sh:path" .-> ONT
    PRC -. "steps: usesConcept, producesConcept" .-> ONT
    PRC -. "appliesRule" .-> RUL
    PRC -. "invokesApi" .-> APR
    PRC -. "createsRecord" .-> RCD
    APR -. "servesConcept" .-> ONT
    APR -- "apiSpecification (file path)" --> OAS
    OAS -. "x-ontology-class, x-ontology-property" .-> ONT
    STW -. "CDE elementOf (the term it represents)" .-> ONT
    STW -. "hasQualityRule" .-> RUL
    RCD -. "recordOf" .-> ONT
    EXA -. "instances of" .-> ONT
    NEG -. "expect_violations FP-R-nnn" .-> RUL
    ONT -. "ent-av:governedBy" .-> TAX
    ONT -. "rdfs:subClassOf, ranges" .-> CORE
```

**(b) Governance, fabric and tooling wiring**

```mermaid
flowchart LR
    subgraph SD["financial-planning"]
        CA[".copier-answers.yml"]
        SY["semantic.yaml"]
        MAN["domain-manifest.ttl"]
        CO["CODEOWNERS"]
        COL["collections/collections.ttl"]
        PARTS["the 8 partition sources<br/>ontology · rules · processes · apis<br/>stewardship · records · manifest · execution"]
        EXM["execution-models/<br/>execution-models.ttl"]
        QRY["queries/rwm_fp_goal_progress.rq"]
        SCH["schemas/rwm_fp_goal_progress.schema.json"]
        CQS["competency-questions/<br/>cq-00n.yaml + .rq"]
        ONT["ontology/planning.ttl"]
        RUL["rules/business-rules.ttl"]
    end
    subgraph ENTR["enterprise"]
        REG["registry"]
        CAP["capability map"]
        TAX["taxonomy"]
        CTL["controls"]
    end
    CA -. "identity answers (D2)" .-> SY
    SY -. "namespace, code (D2)" .-> REG
    MAN -. "describesDomain, realizesCapability" .-> CAP
    MAN -. "anchoredTo" .-> TAX
    MAN -. "hasOntologyModule (D3)" .-> ONT
    MAN == "semtool codeowners" ==> CO
    COL -- "ent-fab:sourcePath globs (D5)" --> PARTS
    COL -. "sensitivity, subjectToControl" .-> CTL
    EXM -- "artifactPath, inputSchemaPath" --> QRY & SCH
    EXM -. "derivedFromRule" .-> RUL
    EXM -. "groundedIn" .-> COL
    CQS -- "query file + bindings (CQ-005)" --> QRY
```

Legend: dotted arrows are references by IRI (a triple whose object is a term defined in the other file); solid arrows are file paths; thick arrows are generation.

## 6.3 `semantic.yaml` wiring between repositories

`semtool` never assumes a layout. It follows these pointers. Every pointer is relative, so the same files work in the monorepo and in separate repositories.

```mermaid
flowchart TB
    GOVY["enterprise-semantic-governance/semantic.yaml<br/>repo_kind: governance<br/>base_iri · teams · fibo.release_tag · graph_name_template<br/>paths: ontology, reference, shapes, assets, alignment"]
    FXY["fibo-extensions/semantic.yaml<br/>repo_kind: fibo-extensions<br/>fibo_dir · catalogs (FIBO, OMG)<br/>paths: ontology, profile, registry, umbrellas"]
    BDY["domains/retail-wealth-management/semantic.yaml<br/>repo_kind: business-domain<br/>domain: name, ontology_domain, code rwm, namespace<br/>paths.ontology: domain.ttl · sub_domains: [...]"]
    FPY["…/financial-planning/semantic.yaml<br/>repo_kind: domain · dependencies: []<br/>domain: name, parent, code rwm-fp, namespace<br/>paths (9 asset kinds) · examples · competency_questions"]
    IAY["…/insights-and-analytics/semantic.yaml<br/>repo_kind: domain · dependencies: [../financial-planning]<br/>domain: code rwm-ia, namespace · paths …"]
    FXY -- "governance: ../enterprise-semantic-governance" --> GOVY
    BDY -- "governance: ../../…" --> GOVY
    BDY -- "fibo_extensions: ../../…" --> FXY
    BDY -- "sub_domains" --> FPY & IAY
    FPY -- "governance / fibo_extensions: ../../../…" --> GOVY & FXY
    IAY -- "governance / fibo_extensions" --> GOVY & FXY
    IAY -- "dependencies" --> FPY
```

What each pointer is used for:

| Pointer | Used by | For |
|---|---|---|
| `governance` | every command | base IRI, teams, FIBO tag, graph-name template; meta-shapes; reference graphs (taxonomy, capability map, meta-model) |
| `fibo_extensions` | `meta`, `extensions`, `closure`, `rules`, `kg`, `cq`, `cards`, `drift` | registry (E2, E3, D2), profile (E3), enterprise core and alignment (closure roots), catalogs, ontology-domain umbrellas (D6) |
| `dependencies` (sub-domain) | `meta` (transitively), `closure`, `rules`, `kg`, `cq`, `cards`, `drift` | the sibling's manifest and ontology as reference (and cycle detection); its published ontology in the closure; its ontology partition and examples in the KG; D4 |
| `sub_domains` (business domain) | `meta`, `closure` (resolving the umbrella's imports), `drift` | the sub-domains' manifests as reference; their modules reasoned together through the umbrella; D6 |
| `paths.*` | every command | which files hold which asset kind; each asset kind maps to one CODEOWNERS owner |

## 6.4 What each gate loads and produces

| Gate | Command | Loads | Writes |
|---|---|---|---|
| G1 | `syntax`, `structure` | every `.ttl` of the repository; the structure standard | — |
| G2 | `meta` | the repository's governed files (the `paths` in `semantic.yaml`, minus examples) as **data**; plus a *reference view* (declarations stripped) of: <ul><li>the governance meta-model, taxonomy, capability map and assets</li><li>the FIBO-extensions ontology and registry</li><li>the dependencies' ontology and manifest</li></ul> Validated against the meta-shapes | — |
| G3 | `extensions` | every governed `.ttl` of the repository; registry; profile | — |
| G4 | `closure`, `reason` | the repository's ontology, dependencies' published modules, enterprise core and alignment, profile, FIBO and OMG through catalogs | `build/closure.ttl`, `build/reasoned.ttl`, `build/closure-unresolved.json` |
| G5 | `rules` | rule shapes + reusable assets (shapes); own ontology, dependencies' ontology, core, and the subclass hierarchy of the closure (context); positive examples; each negative case | — |
| G6 | `cq` | the assembled knowledge graph; `competency-questions/*.yaml` and their queries | — |
| G7 | `kg`, `cards` | enterprise graphs + the collection's partitions + dependencies' ontology partitions + FIBO labels and parents from the closure + examples as test graphs; the retrieval contract | `build/kg.trig`, `build/graphrag/cards.jsonl`, `edges.jsonl` |
| G8 | `drift` | see [doc 7 §7.2](07-change-management.md#72-where-every-fact-lives) | — (the generated-file check works in a temporary copy) |
| PR | `changes --base` | `git diff` against the base; the old version of each changed file (`git show`) | — |

```mermaid
flowchart LR
    SRC["sources<br/>(committed)"] -- closure --> CL["build/closure.ttl"] -- "reason (ELK, HermiT)" --> RS["build/reasoned.ttl"]
    SRC -- kg --> KG["build/kg.trig"]
    CL -- "FIBO labels + parents" --> KG
    KG -- cards --> CARDS["build/graphrag/<br/>cards.jsonl + edges.jsonl"]
    KG -- cq --> CQ{{"competency questions<br/>answer as expected"}}
    CARDS -. "indexed by" .-> RAG["GraphRAG runtime"]
    KG -. "released versions loaded by" .-> TS[("serving triple store")]
```

`build/` is never committed (`.gitignore`). CI uploads it as an artifact.

## 6.5 Generated files

Some files are generated from others. They are committed, so they can be reviewed and loaded without running tools. They are **never edited by hand**: D9 regenerates them in a scratch copy and fails if the committed file differs.

```mermaid
flowchart LR
    TMD["taxonomy/source/<br/>enterprise-taxonomy.md"] == "semtool taxonomy" ==> TTTL["taxonomy/<br/>enterprise-taxonomy.ttl"]
    CSV["capabilities/source/<br/>capability-map.csv"] == "semtool capabilities" ==> CMAP["capabilities/<br/>capability-map.ttl"]
    CUR["capabilities/curation.yaml"] == "semtool capabilities" ==> CMAP
    XW["capabilities/<br/>taxonomy-crosswalk.csv"] == "semtool capabilities" ==> CMAP
    CUR == "semtool capabilities" ==> DQR["capabilities/<br/>data-quality-report.md"]
    MANI["domain-manifest.ttl<br/>(roles, review teams)"] == "semtool codeowners" ==> COW["CODEOWNERS"]
    TPL["domain-template/template/*.jinja"] == "new_domain.py / copier" ==> SDR["a new sub-domain<br/>(+ .copier-answers.yml)"]
    ANS["answers/*.yaml"] == "new_domain.py / copier" ==> SDR
    PTPL["domain-template/parent-template/*.jinja"] == "new_domain.py (first sub-domain)" ==> BDR["business-domain parent layer"]
```

| Generated file | Regenerate with | Freshness check |
|---|---|---|
| `enterprise-semantic-governance/taxonomy/enterprise-taxonomy.ttl` | `make taxonomy` | D9 |
| `enterprise-semantic-governance/capabilities/capability-map.ttl`, `data-quality-report.md` | `make capabilities` | D9 |
| `domains/*/*/CODEOWNERS` | `make codeowners` (also run by `verify`) | D9 |
| a sub-domain's template-owned files (CI, `.gitignore`, `semantic.yaml` wiring) | `copier update` | `make align` fails if one differs (DRIFTED) |
| `build/*` | `make verify` | not committed |

## 6.6 How an import IRI finds its file

`semtool closure` never downloads. It resolves each `owl:imports` IRI to a local file:

1. It scans every `.ttl` in the governance repository, FIBO extensions, the repository under test and its dependencies, and maps each `owl:Ontology` IRI to its file.
2. It then reads FIBO's `catalog-v001.xml` and the OMG `catalog-v001.xml` (fetched automatically by `make`, see `make omg`) to map FIBO and OMG IRIs to files under `vendor/`.
3. It follows imports transitively from the roots: own modules, enterprise core and alignment, and the profile. It merges everything into `build/closure.ttl`, and records unresolved IRIs in `build/closure-unresolved.json`. It warns about them rather than failing, because OMG Commons and LCC are absent until `vendor/omg` has been fetched.

This is why the **ontology IRI in a file's header is load-bearing**. If a header IRI changes without every importer changing too, the import stops resolving. The closure only warns, and the reasoner then checks less than intended. D1, D3, D4 and D6 catch the usual versions of that mistake: version IRIs, manifest module lists, dependency imports and umbrella imports. E3 rejects an import of a module that is no longer published.

Next: [Change management without drift →](07-change-management.md)
