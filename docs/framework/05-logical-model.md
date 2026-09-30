# 5 · Logical model

These diagrams show the **logical** relationships of the semantic model: which kinds of things exist and how they relate. They are drawn from the RDF itself (`ontology/governance.ttl`, `process.ttl`, `controls.ttl`, `fabric/fabric.ttl`, `annotations.ttl`, and the Retail Wealth Management ontologies). Class names drop the prefix for readability:

| Prefix | Namespace | Holds |
|---|---|---|
| `ent-gov:` | `{base}governance/model/` | domains, manifests, roles, rules, APIs, CDEs, record classes, registrations, alignment |
| `ent-proc:` | `{base}governance/process/` | processes and steps |
| `ent-ctl:` | `{base}governance/controls/` | AI risks, controls, risk assessments, sensitivity classes |
| `ent-fab:` | `{base}fabric/model/` | collections, partitions, execution models, agent classes, reusable assets |
| `ent-av:` | `{base}governance/annotations/` | annotation profile (`governedBy`, `agentGuidance`, `ruleStatement`, `owningDomain`, …) |
| `ent-core:` | `{base}fibo-ext/core/` | enterprise core terms |
| `fp:` · `ia:` · `fa:` | `{base}domain/retail-wealth-management/financial-planning/planning/` · `…/insights-and-analytics/insights/` · `…/insights-and-analytics/assessments/` | sub-domain ontology modules |

## 5.1 Capability map, domains and accountability

The enterprise structure that every sub-domain hangs from. The capability map and taxonomy are generated from their sources (ADR-0004). Registrations and manifests are hand-written and checked against them (D2, D6).

**(a) Domain structure, capabilities and the registry**

```mermaid
classDiagram
    direction TB
    class OntologyDomain {
        e.g. Investment Servicing
    }
    class BusinessDomain {
        e.g. Retail Wealth Management
        rdfs:label
    }
    class SubDomain {
        e.g. Financial Planning
    }
    class Capability {
        skos:Concept in ent-cap:CapabilityMap
        capabilityStatus Authoritative or Proposed
    }
    class TechnologyCapability {
        never a business anchor
    }
    class TaxonomyNode {
        skos:Concept in EnterpriseTaxonomy
    }
    class DomainRegistration {
        domainCode
        namespace
        codeRepository
        registrationStatus Reserved or Provisional
    }
    class OntologyModule {
        owl:Ontology
        owl:versionIRI and owl:versionInfo
        maturity Provisional, Release or Informative
    }
    BusinessDomain <|-- SubDomain
    Capability <|-- TechnologyCapability
    BusinessDomain "*" --> "0..1" OntologyDomain : inOntologyDomain
    SubDomain "*" --> "1" BusinessDomain : isSubDomainOf
    Capability "*" --> "0..1" BusinessDomain : accountableDomain
    Capability "*" --> "0..1" Capability : skos-broader
    BusinessDomain "*" --> "*" TaxonomyNode : ent-av-governedBy
    DomainRegistration "1" --> "1" BusinessDomain : registersDomain
    DomainRegistration "1" --> "*" OntologyModule : publishedModule
```

**(b) Manifests and accountability**

```mermaid
classDiagram
    direction LR
    class DomainManifest {
        one per sub-domain
        namespace
        codeRepository
    }
    class ParentDomainManifest {
        one per business domain
        namespace
    }
    class AccountableRole {
        heldBy
        reviewTeam - generates CODEOWNERS
        accountableFor
    }
    class SubDomain
    class BusinessDomain
    class Capability
    class TaxonomyNode
    class OntologyModule
    AccountableRole <|-- DomainOwner
    AccountableRole <|-- RuleOwner
    AccountableRole <|-- ApiOwner
    AccountableRole <|-- DataSteward
    AccountableRole <|-- RecordsOwner
    AccountableRole <|-- AIRiskOwner
    DomainManifest --> SubDomain : describesDomain
    DomainManifest --> SubDomain : dependsOnSubDomain 0..*
    DomainManifest --> OntologyModule : hasOntologyModule 1..*
    DomainManifest --> Capability : realizesCapability 1..*
    DomainManifest --> TaxonomyNode : anchoredTo 1..*
    DomainManifest --> DomainOwner : hasDomainOwner
    DomainManifest --> RuleOwner : hasRuleOwner
    DomainManifest --> ApiOwner : hasApiOwner
    DomainManifest --> DataSteward : hasDataSteward 1..*
    DomainManifest --> RecordsOwner : hasRecordsOwner
    ParentDomainManifest --> BusinessDomain : describesDomain
    ParentDomainManifest --> SubDomain : includesSubDomain 1..*
    ParentDomainManifest --> DomainOwner : hasDomainOwner
```

Things to note:
- A **sub-domain is a business domain**: `ent-gov:SubDomain` is a subclass of `ent-gov:BusinessDomain`. Anything that can be said of a business domain (anchors, capabilities, accountability) can be said of a sub-domain.
- **Capability accountability** is one domain per capability (`accountableDomain`). The domain with the deepest anchor is chosen during curation (ADR-0004).
- The **registry** and the **manifest** both point at the same capability-map node, from the enterprise side and the domain side. D2 checks that they agree.
- **Dependencies** are declared at the level of sub-domains (`dependsOnSubDomain`) and implemented at the level of modules (`owl:imports` of a `publishedModule`). D4 keeps the two in step.

## 5.2 Domain assets: what a sub-domain describes

Each sub-domain's rules, processes, APIs, data and records are all **about** its ontology classes. They refer to them by IRI, and each has one accountable owner.

```mermaid
classDiagram
    direction LR
    class BusinessClass {
        owl:Class in a sub-domain module
        rdfs:label, skos:definition
        ent-av:governedBy TaxonomyNode
        ent-av:agentGuidance
    }
    class FIBOClass {
        a FIBO or ent-core class
    }
    class BusinessRule {
        sh:NodeShape
        ruleIdentifier PREFIX-R-nnn
        ruleStatement - authoritative
        policySource
        sh:severity, sh:message
    }
    class BusinessProcess {
        prov:Plan
        ent-av:realizesCapability
        bpmnReference
    }
    class ProcessStep {
        stepOrder
        automationLevel Manual, SystemAutomated, AgentAssisted or CustomerSelfService
        humanApprovalRequired
    }
    class DomainApi {
        dcat:DataService
        apiSpecification - OpenAPI with x-ontology-class
    }
    class DataProduct {
        dcat:Dataset, dprod:DataProduct
    }
    class CriticalDataElement
    class RecordClass {
        retentionPeriod xsd:duration
        retentionTrigger
        legalHoldApplicable
        dispositionMethod
        ent-av:regulatoryCitation
    }
    class NegativeTest {
        tests/negative/nc-nnn
    }

    BusinessClass --|> FIBOClass : rdfs-subClassOf (E4)
    BusinessRule --> BusinessClass : sh-targetClass
    BusinessRule --> RuleOwner : hasRuleOwner
    NegativeTest ..> BusinessRule : must trip
    BusinessProcess "1" --> "1..*" ProcessStep : hasStep
    ProcessStep --> ProcessStep : precededBy
    ProcessStep --> BusinessClass : usesConcept / producesConcept
    ProcessStep --> BusinessRule : appliesRule
    ProcessStep --> DomainApi : invokesApi
    ProcessStep --> RecordClass : createsRecord
    DomainApi --> BusinessClass : servesConcept
    DomainApi --> ApiOwner : hasApiOwner
    DataProduct --> DataSteward : hasDataSteward
    CriticalDataElement --> BusinessClass : elementOf (the term it represents)
    CriticalDataElement --> BusinessRule : hasQualityRule
    CriticalDataElement --> DataSteward : hasDataSteward
    RecordClass --> BusinessClass : recordOf
    RecordClass --> RecordsOwner : hasRecordsOwner
```

The **rule** has two forms, and both are required (standard 02):
- The **statement** (`ent-av:ruleStatement`) is authoritative.
- The **shape** is how it is checked.

If they disagree, the shape is the defect. An `AgentAssisted` step must apply at least one rule that is published in a rule pack (CTL-005).

## 5.3 Fabric, AI risk and controls: how knowledge reaches AI

```mermaid
classDiagram
    direction LR
    class KnowledgeCollection {
        dcat:Dataset
        owl:versionInfo - semver
    }
    class GraphPartition {
        partitionKind - one of 8 partitions
        graphName base/graph/code/collection/vX.Y.Z/partition
        sourcePath - repository globs
    }
    class UsagePolicy {
        odrl:Policy
        permitted agent classes and purposes
        prohibitions
    }
    class AgentClass {
        odrl:Party
    }
    class SensitivityClass {
        Public, Internal, Confidential or RestrictedPersonal
    }
    class AIControl {
        CTL-001 .. CTL-008
        enforcementPoint
    }
    class AIRisk {
        RSK-001 .. RSK-006
    }
    class RiskAssessment {
        residualRiskRating
        assessmentDate
    }
    class ExecutionModel {
        toolName
        artifactPath
    }
    class QueryTool {
        inputSchemaPath
    }
    class RulePack
    class ProcessModel
    class ReusableAsset {
        fabric/reusable-assets
    }

    ExecutionModel <|-- QueryTool
    ExecutionModel <|-- RulePack
    ExecutionModel <|-- ProcessModel
    KnowledgeCollection --> BusinessDomain : publishedBy
    KnowledgeCollection "1" --> "8" GraphPartition : hasPartition
    KnowledgeCollection --> UsagePolicy : usagePolicy
    KnowledgeCollection --> SensitivityClass : sensitivity
    KnowledgeCollection --> AIControl : subjectToControl (CTL-001 always)
    KnowledgeCollection --> RiskAssessment : hasRiskAssessment
    UsagePolicy --> AgentClass : odrl-permission assignee (with purpose)
    ExecutionModel --> KnowledgeCollection : groundedIn
    ExecutionModel --> BusinessRule : derivedFromRule
    ExecutionModel --> BusinessProcess : implementsProcess
    ExecutionModel --> AIControl : subjectToControl (CTL-006 always)
    ExecutionModel --> RiskAssessment : hasRiskAssessment
    RiskAssessment --> AIRisk : identifiedRisk
    RiskAssessment --> AIRiskOwner : approvedBy
    AIControl --> AIRisk : mitigatesRisk
```

## 5.4 Alignment and enterprise core

```mermaid
classDiagram
    direction LR
    class AlignmentDecision {
        ALN-nnn
        alignmentType
        Equivalent, Specialization, RelatedNotEquivalent or Conflict
    }
    class Term {
        a class or property in a sub-domain module or ent-core
    }
    class CoreTerm {
        ent-core term
        ent-av:owningDomain
    }
    class AlignmentAxiom {
        fibo-ext/alignment module
        cites ALN-nnn
    }
    Term <|-- CoreTerm
    AlignmentDecision --> Term : alignsTerm
    AlignmentDecision --> BusinessDomain : consultedDomain
    CoreTerm --> BusinessDomain : owningDomain (one, registered)
    AlignmentAxiom ..> AlignmentDecision : implements
    AlignmentAxiom ..> Term : relates terms of different domains
```

| Decision | Type | Effect |
|---|---|---|
| ALN-001 | Equivalent | `ent-core:RetailCustomer` (owning domain: Customer Management) replaces per-domain customer classes |
| ALN-002 | Related, not equivalent | `ia:SelfDirectedInsight` must not be conflated with an advised recommendation (the advice boundary; CTL-007) |

D8 checks that every `alignsTerm` still exists, that every consulted domain is in the capability map, and that every core term's owning domain is registered.

## 5.5 FIBO grounding of Retail Wealth Management

Every class specializes FIBO, directly or through enterprise core or another class of the same sub-domain (meta-shape E4; checked by reasoning in G4).

```mermaid
flowchart BT
    subgraph FIBO["FIBO (profile modules)"]
        direction LR
        FO["fibo-fnd-gao-obj:<br/>FinancialObjective"]
        ST["fibo-fnd-gao-obj:<br/>Strategy"]
        EV["fibo-fnd-arr-asmt:<br/>ExpectedValue"]
        AA["fibo-fnd-arr-asmt:<br/>AssessmentActivity"]
        OP["fibo-fnd-arr-asmt:<br/>Opinion"]
        KPI["fibo-fnd-utl-alx:<br/>KeyPerformanceIndicator"]
        CU["fibo-fnd-pas-pas:<br/>Customer"]
        RP["fibo-fnd-arr-rep:<br/>Report"]
        CL["cmns-cls:<br/>Classifier"]
    end
    subgraph CORE["enterprise core (fibo-ext/core)"]
        direction LR
        RC["RetailCustomer<br/>(owner: Customer Mgmt)"]
        MT["MortalityTable<br/>(owner: Common Ref Data)"]
        SDM["ServiceDeliveryModel<br/>(owner: RWM)"]
    end
    subgraph FP["financial-planning · planning module"]
        direction LR
        FG["FinancialGoal"]
        RG["RetirementGoal"]
        PLN["FinancialPlan"]
        SDP["SelfDirectedPlan"]
        PS["PlanningScenario"]
        PA["PlanningAssumption"]
        LEA["LifeExpectancyAssumption"]
        GP["GoalProjection"]
    end
    subgraph IA["insights-and-analytics · insights + assessments modules"]
        direction LR
        PI["PlanningInsight"]
        SDI["SelfDirectedInsight"]
        IC["InsightCategory"]
        SA["SuggestedAction"]
        FHS["fa:FinancialHealthScore"]
    end
    RC --> CU
    MT --> RP
    SDM --> CL
    FG --> FO
    RG --> FG
    PLN --> ST
    SDP --> PLN
    PS --> AA
    PA --> EV
    LEA --> PA
    GP --> EV
    PI --> OP
    SDI --> PI
    IC --> CL
    SA --> CL
    FHS --> KPI
```

The main relationships between these classes (object properties with their domain and range):

```mermaid
classDiagram
    direction LR
    class FinancialGoal {
        hasGoalReference string
        hasTargetDate date
    }
    class GoalProjection {
        probabilityOfSuccess decimal 0..1
    }
    class PlanningAssumption {
        assumedValue decimal
    }
    class MortalityTable {
        tableVersion string
    }
    class PlanningInsight {
        insightText string
    }
    FinancialGoal <|-- RetirementGoal
    FinancialPlan <|-- SelfDirectedPlan
    PlanningAssumption <|-- LifeExpectancyAssumption
    PlanningInsight <|-- SelfDirectedInsight
    FinancialGoal --> RetailCustomer : fp-hasGoalOwner
    FinancialGoal --> MonetaryAmount : fp-hasTargetAmount
    FinancialGoal --> Account : fp-isFundedBy
    FinancialPlan --> FinancialGoal : fp-hasPlanGoal
    FinancialPlan --> PlanningScenario : fp-hasScenario
    PlanningScenario --> PlanningAssumption : fp-usesAssumption
    LifeExpectancyAssumption --> MortalityTable : fp-sourcedFromTable
    GoalProjection --> FinancialGoal : fp-projectsGoal
    GoalProjection --> PlanningScenario : fp-producedByScenario
    GoalProjection --> MonetaryAmount : fp-hasProjectedAmount
    PlanningInsight --> FinancialGoal : ia-relatesToGoal (cross-sub-domain, via published module)
    PlanningInsight --> RetailCustomer : ia-insightFor
    PlanningInsight --> InsightCategory : ia-hasInsightCategory
    PlanningInsight --> SuggestedAction : ia-suggestsAction (IA-R-001 no Buy/SellSecurity on SelfDirectedInsight)
    PlanningInsight --> Security : ia-refersToSecurity
    FinancialHealthScore --> RetailCustomer : fa-scoresCustomer
```

`MonetaryAmount` (`fibo-fnd-acc-cur:`), `Account` (`fibo-fbc-pas-caa:`) and `Security` (`fibo-fbc-fi-fi:`) are FIBO classes. `RetailCustomer` and `MortalityTable` are enterprise core.

## 5.6 Worked example: Retail Wealth Management as instance data

The same structures filled in for the current repository. This is what the knowledge graph actually contains, and what competency questions CQ-001 to CQ-003 and CQ-104 query.

```mermaid
flowchart BT
    OD(["Investment Servicing<br/>OntologyDomain"])
    RWM(["Retail Wealth Management<br/>BusinessDomain · registry rwm"])
    FPd(["Financial Planning<br/>SubDomain · registry rwm-fp"])
    IAd(["Insights and Analytics<br/>SubDomain · registry rwm-ia"])
    RWM -- inOntologyDomain --> OD
    FPd -- isSubDomainOf --> RWM
    IAd -- isSubDomainOf --> RWM

    PM["rwm-p:ParentManifest<br/>(domain.ttl)"]
    PM -- describesDomain --> RWM
    PM -- includesSubDomain --> FPd
    PM -- includesSubDomain --> IAd

    C0["capability: Financial Planning"] -- accountableDomain --> RWM
    C12["capabilities: Goal-Based Planning,<br/>Retirement Income Projection"] -- accountableDomain --> FPd
    C3["capability: Planning Insights & Analytics"] -- accountableDomain --> IAd

    FPM["fp-m:Manifest"] -- describesDomain --> FPd
    IAM["ia-m:Manifest"] -- describesDomain --> IAd
    IAM -- dependsOnSubDomain --> FPd
    FPM -- hasOntologyModule --> FPmod["planning module<br/>(published)"]
    IAM -- hasOntologyModule --> IAmod["insights module<br/>(published)"]
    IAM -- hasOntologyModule --> ASmod["assessments module"]
    IAmod -- "owl:imports" --> FPmod

    FPA["financial-planning assets<br/>rules FP-R-001..004 · GoalPlanningCycle<br/>PlanningApi · GoalsAndPlans + 4 CDEs · PlanRecord<br/>tool rwm_fp_goal_progress"]
    IAA["insights-and-analytics assets<br/>rules IA-R-001..003 · InsightCycle (step 2 AgentAssisted)<br/>InsightsApi · PlanningInsights + CDE · InsightRecord<br/>tools rwm_ia_customer_insights · rwm_ia_advice_boundary_rulepack<br/>· rwm_ia_insight_cycle"]
    FPA -. "about" .-> FPmod
    IAA -. "about" .-> IAmod
    IAA -- "ScoreFinancialHealth precededBy RunProjection" --> FPA
    ALN["ALN-002 advice boundary"] -- "alignsTerm SelfDirectedInsight" --> IAmod
```

Next: [Physical model →](06-physical-model.md)
