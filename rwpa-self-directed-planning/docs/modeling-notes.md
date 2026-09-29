# Modelling notes: Self-Directed Wealth Planning, Insights & Analytics (seed slice v0.1.0)

This baseline was built to exercise every accountability and every fabric artefact from end to end. Detailed modelling builds on it.

## What the slice covers

| Accountability | Assets |
|---|---|
| Meaning | 13 classes, 21 properties (`ontology/planning.ttl`): goals, plans, scenarios, assumptions, projections, health score, insights, insight categories, suggested actions |
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
| FinancialHealthScore | `fibo-fnd-utl-alx:KeyPerformanceIndicator` | |
| PlanningInsight, SelfDirectedInsight | `fibo-fnd-arr-asmt:Opinion` | |
| InsightCategory, SuggestedAction | `cmns-cls:Classifier` (OMG Commons, via FIBO) | |
| (core) RetailCustomer | `fibo-fnd-pas-pas:Customer` | alignment ALN-001 |
| (core) MortalityTable | `fibo-fnd-arr-rep:Report` | **FIBO-GAP**: no reference-table concept |

## The advice boundary, end to end

1. **Meaning.** `SelfDirectedInsight` is defined as never recommending a specific transaction in a specific security. `ent-core:ServiceDeliveryModel` distinguishes self-directed from advised delivery.
2. **Alignment.** ALN-002 records that self-directed insights and advised recommendations are *related, not equivalent*.
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
- Re-confirm capability assignments once the authoritative capability map is imported (ADR-0003).
- Add RML mappings from the planning platform's physical sources (`mappings/`).
- Decide whether `FinancialGoal` and the projection classes should be published for reuse by Advised Planning & Advice (add `ent-gov:publishedModule` in the registry).
