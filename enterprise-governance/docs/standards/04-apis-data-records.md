# 04 · Domain APIs, data stewardship and record keeping

These three are **domain-owned**. The enterprise only sets how they are described, so the knowledge graph can answer questions like "which API serves this concept", "who stewards it" and "how long must we keep it".

## Domain APIs (`apis/`)

- The API contract stays in OpenAPI (`apis/*.openapi.yaml`). Annotate each schema with **`x-ontology-class`** and each property with **`x-ontology-property`**, using full IRIs.
- Register each API in `apis/api-registry.ttl` as an `ent-gov:DomainApi` (a `dcat:DataService`). Required: `ent-gov:apiSpecification`, `ent-gov:servesConcept` (one or more classes), `ent-gov:hasApiOwner`, `ent-av:governedBy`.
- An API that returns a concept must return data that conforms to that concept's business rules. Contract tests should reuse the domain's SHACL shapes.

## Data stewardship (`stewardship/`)

- **Data products** are described with DCAT (`dcat:Dataset`) and may also carry the EKGF Data Product ontology type (`dprod:DataProduct`). Each needs `ent-gov:hasDataSteward`.
- **Critical data elements** (`ent-gov:CriticalDataElement`) point to the ontology property they represent (`ent-gov:elementOf`), have a steward, and should have at least one quality rule (`ent-gov:hasQualityRule` → a business rule).
- **Physical mappings** from sources to the ontology go in `mappings/` as RML. Each mapping file names the dataset it populates.

## Record keeping (`records/`)

- Each `ent-gov:RecordClass` states:
  - `ent-gov:recordOf`: the ontology class whose instances are records
  - `ent-gov:retentionPeriod`: an `xsd:duration`
  - `ent-gov:retentionTrigger`
  - `ent-gov:legalHoldApplicable`
  - `ent-gov:dispositionMethod`
  - `ent-gov:storageRequirement`
  - `ent-av:regulatoryCitation`
  - `ent-gov:hasRecordsOwner`
- Regulatory citations in templates are **placeholders**. The records owner confirms them with Legal and Compliance before the maturity level moves to Release.
- Anything an agent delivers to a customer that could be a communication or recommendation needs a record class (CTL-008).
