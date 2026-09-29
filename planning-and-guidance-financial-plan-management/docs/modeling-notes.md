# Modelling notes: Financial Plan Management, self-directed wealth planning slice (v0.1.0)

This baseline was built to exercise every accountability and every fabric artefact from end to end. Detailed modelling builds on it.

## Place in the capability map (ADR-0004)

| | |
|---|---|
| Ontology domain | **Planning and Guidance** |
| Business domain (accountable) | **Financial Plan Management** (`pg-fpm`) |
| Capabilities realized | Financial Planning > Goal-Based Planning · Retirement Income Projection · Planning Insights & Analytics (all **proposed**: the source map has no capabilities for this domain) |
| Related domains | **Financial Assessments** (owns the financial health score; `assessments.ttl` incubated here) · **Calculator Management** (Investment Servicing; performs projection calculations) · **Retail Wealth Management** (Investment Servicing; the advised side of the advice boundary, ALN-002) · **Customer Management** (owns RetailCustomer) · **Common Reference Data** (owns MortalityTable) |

## What the slice covers

| Accountability | Assets |
|---|---|
| Meaning | 13 classes, 21 properties: `ontology/planning.ttl` (goals, plans, scenarios, assumptions, projections, insights, insight categories, suggested actions) and `ontology/assessments.ttl` (financial health score) |
| Rules | SDP-R-001 … SDP-R-007 (`rules/business-rules.ttl`), each with a negative test |
| Processes | Self-directed planning cycle, 6 steps; step 5 is agent-assisted |
| APIs | Self-Directed Planning API, Planning Insights API (OpenAPI with `x-ontology-*`) |
| Data | 2 data products, 5 critical data elements with quality rules |
| Records | Delivered insight record, self-directed plan record (retention **placeholders**) |
| Fabric | 1 knowledge collection (8 named graphs, ODRL policy that prohibits use for personalized advice); 3 execution models: advice-boundary rule pack, `sdp_goal_progress` query tool, planning-cycle process model |

## FIBO parent choices (semantic review record)

| Class | FIBO parent | Note |
|---|---|---|
| FinancialGoal, RetirementGoal | `fibo-fnd-gao-obj:FinancialObjective` | FIBO `Goal` is qualitative; our goals are quantified |
| FinancialPlan, SelfDirectedPlan | `fibo-fnd-gao-obj:Strategy` | **FIBO-GAP**: no plan concept |
| PlanningScenario | `fibo-fnd-arr-asmt:AssessmentActivity` | |
| PlanningAssumption, LifeExpectancyAssumption, GoalProjection | `fibo-fnd-arr-asmt:ExpectedValue` | |
| FinancialHealthScore (assessments module) | `fibo-fnd-utl-alx:KeyPerformanceIndicator` | owned by Financial Assessments |
| PlanningInsight, SelfDirectedInsight | `fibo-fnd-arr-asmt:Opinion` | |
| InsightCategory, SuggestedAction | `cmns-cls:Classifier` (OMG Commons, via FIBO) | |
| (core) RetailCustomer | `fibo-fnd-pas-pas:Customer` | alignment ALN-001 |
| (core) MortalityTable | `fibo-fnd-arr-rep:Report` | **FIBO-GAP**: no reference-table concept |

## Rules, tools and tests

| Rule | Negative test | Enforced at runtime by |
|---|---|---|
| SDP-R-001 advice boundary | `tests/negative/nc-001-buy-recommendation.ttl` | `sdp_advice_boundary_rulepack` |
| SDP-R-002 goal completeness | `tests/negative/nc-002-incomplete-goal.ttl` | `Self-Directed Planning API` (422) |
| SDP-R-003 life expectancy provenance | `tests/negative/nc-003-unsourced-life-expectancy.ttl` | projection step (Calculator Management) |
| SDP-R-004 health score validity | `tests/negative/nc-004-invalid-health-score.ttl` | health-score step (Financial Assessments) |
| SDP-R-005 insight traceability | `tests/negative/nc-005-insight-without-provenance.ttl` | `sdp_advice_boundary_rulepack` |
| SDP-R-006 projection validity | `tests/negative/nc-006-probability-out-of-range.ttl` | `sdp_goal_progress` (reads only valid projections) |
| SDP-R-007 retirement scenario completeness | `tests/negative/nc-003-unsourced-life-expectancy.ttl` (shared) | projection step (Calculator Management) |

| Competency question | Source |
|---|---|
| CQ-001 rules and owners · CQ-002 accountability · CQ-003 capability governance · CQ-004 FIBO grounding · CQ-005 query tool (`sdp_goal_progress`) | template-owned, edited in place |
| CQ-101 serving & stewardship · CQ-102 execution-model controls · CQ-103 agent-assisted steps | domain-specific |

## The advice boundary, end to end

1. **Meaning.** `SelfDirectedInsight` is defined as never recommending a specific transaction in a specific security. `ent-core:ServiceDeliveryModel` distinguishes self-directed from advised delivery.
2. **Alignment.** ALN-002 records that self-directed insights and advised recommendations (to be owned by Retail Wealth Management) are *related, not equivalent*.
3. **Rule.** SDP-R-001, owned by the rule owner, with its policy source cited.
4. **Process.** Step 5 (agent-assisted) applies SDP-R-001 and SDP-R-005.
5. **Execution model.** `sdp_advice_boundary_rulepack` runs these rules on agent output before delivery (CTL-005), with an approved risk assessment.
6. **Policy.** The collection's ODRL policy prohibits using this knowledge for the purpose "personalized advice".
7. **Records.** Delivered insights are retained with model provenance (CTL-008).
8. **Tests.** `tests/negative/nc-001-buy-recommendation.ttl` proves the rule pack blocks a buy recommendation.

## Open items for the domain

- Confirm retention periods and regulatory citations (records owner, with Legal & Compliance).
- Replace placeholder policy references in rule `policySource` values.
- Replace placeholder role holders and review teams in `domain-manifest.ttl`.
- Ask the capability-map owners to add the proposed Financial Planning capabilities (and Financial Assessment) to the authoritative map, then remove them from `curation.yaml`.
- Transfer `ontology/assessments.ttl`, rule SDP-R-004 and the health-score data to Financial Assessments once `pg-fa` exists.
- Add RML mappings from the planning platform's physical sources (`mappings/`).
- The `planning` module is already published (registry) and imported by the Planning and Guidance umbrella, so Retail Wealth Management can reuse goals and projections.
