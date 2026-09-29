# Modelling notes: Retail Wealth Management › Insights and Analytics

Owned by the domain owner. This is the semantic review record for the sub-domain.

## Place in the capability map

| | |
|---|---|
| Business domain › sub-domain | **Retail Wealth Management › Insights and Analytics** (`rwm-ia`) |
| Ontology domain (capability map) | Investment Servicing (metadata only) |
| Capabilities realized | Financial Planning › Planning Insights & Analytics (**proposed**) |
| Builds on | **Financial Planning**: imports its published `planning` module (`semantic.yaml` `dependencies`, `ent-gov:dependsOnSubDomain`) |
| Related domains | Financial Assessments (accountable for the health score; `assessments.ttl` incubated here) · Customer Management (owns `RetailCustomer`) · a future advice sub-domain of Retail Wealth Management (advised side of the advice boundary, ALN-002) |

## How it builds on Financial Planning (extension point)

| Here | Uses from Financial Planning | How |
|---|---|---|
| `ia:relatesToGoal` | `fp:FinancialGoal` | property range |
| process step *score financial health* | `fp:GoalProjection`, after `fp-proc:RunProjection` | `ent-proc:usesConcept`, `ent-proc:precededBy` (hand-off) |
| process step *generate insights* | `fp:GoalProjection` | `ent-proc:usesConcept` |
| `rwm_ia_customer_insights` | `fp:hasGoalReference` | query |

This sub-domain never mints terms in Financial Planning's namespace (rule E2); it imports only the published module (rule E3). CQ-104 lists every such dependency from the knowledge graph.

## FIBO parent choices

| Class | FIBO parent | Note |
|---|---|---|
| PlanningInsight → SelfDirectedInsight | `fibo-fnd-arr-asmt:Opinion` | |
| InsightCategory, SuggestedAction | `cmns-cls:Classifier` (OMG Commons, via FIBO) | |
| FinancialHealthScore (assessments module) | `fibo-fnd-utl-alx:KeyPerformanceIndicator` | owned by Financial Assessments when it has a repository |

## Rules, tools and tests

| Rule | Negative test | Enforced at runtime by |
|---|---|---|
| IA-R-001 advice boundary | `nc-001-buy-recommendation.ttl` | `rwm_ia_advice_boundary_rulepack` |
| IA-R-002 health score validity | `nc-002-invalid-health-score.ttl` | health-score step (Financial Assessments) |
| IA-R-003 insight traceability | `nc-003-insight-without-provenance.ttl` | `rwm_ia_advice_boundary_rulepack` |

Competency questions: CQ-001…CQ-005 come from the template (CQ-005 exercises `rwm_ia_customer_insights`). CQ-101 covers serving and stewardship, CQ-102 execution-model controls, CQ-103 agent-assisted steps, CQ-104 dependencies on Financial Planning.

## The advice boundary, end to end

1. **Meaning.** `SelfDirectedInsight` never recommends a specific transaction in a specific security. `ent-core:ServiceDeliveryModel` separates self-directed from advised.
2. **Alignment.** ALN-002: self-directed insights and advised recommendations are *related, not equivalent*.
3. **Rule.** IA-R-001, with a rule owner and policy source.
4. **Process.** Step 2 (agent-assisted) applies IA-R-001 and IA-R-003.
5. **Execution model.** `rwm_ia_advice_boundary_rulepack` runs on agent output before delivery (CTL-005).
6. **Policy.** The collection prohibits use for "personalized advice".
7. **Records.** Delivered insights are retained with model provenance (CTL-008).
8. **Test.** `nc-001-buy-recommendation.ttl` proves the rule blocks a buy recommendation.

## Open items

- Move `assessments.ttl`, IA-R-002 and the health-score data to Financial Assessments once it has a repository.
- Replace placeholder role holders, policy sources and retention citations.
