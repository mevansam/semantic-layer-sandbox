# Modelling notes: Retail Wealth Management › Planning and Guidance

Owned by the domain owner. This is the semantic review record for the sub-domain.

## Place in the capability map

| | |
|---|---|
| Business domain › sub-domain | **Retail Wealth Management › Planning and Guidance** (`rwm-pg`) |
| Ontology domain (capability map) | Investment Servicing (metadata only). Note that "Planning and Guidance" is also the name of a *different* ontology domain in the map. |
| Capabilities realized | Financial Planning › Goal-Based Planning · Retirement Income Projection (both **proposed**) |
| Builds on | nothing: this is the base sub-domain of Retail Wealth Management |
| Built on by | **Insights and Analytics** (imports the published `planning` module; uses `FinancialGoal`, `GoalProjection`) |
| Related domains | Calculator Management (performs projections) · Customer Management (owns `RetailCustomer`) · Common Reference Data (owns `MortalityTable`) |

## FIBO parent choices

| Class | FIBO parent | Note |
|---|---|---|
| FinancialGoal → RetirementGoal | `fibo-fnd-gao-obj:FinancialObjective` | FIBO `Goal` is qualitative; our goals are quantified |
| FinancialPlan → SelfDirectedPlan | `fibo-fnd-gao-obj:Strategy` | **FIBO-GAP**: no plan concept |
| PlanningScenario | `fibo-fnd-arr-asmt:AssessmentActivity` | |
| PlanningAssumption → LifeExpectancyAssumption, GoalProjection | `fibo-fnd-arr-asmt:ExpectedValue` | |

## Published module (a contract)

`planning` (`…/retail-wealth-management/planning-and-guidance/planning/`) is published in the registry. Insights and Analytics and the Retail Wealth Management umbrella import it. Renaming or removing a class or property, or narrowing a range, is a **breaking change**: it needs a MAJOR version and the business-domain owner's agreement.

## Rules, tools and tests

| Rule | Negative test | Enforced at runtime by |
|---|---|---|
| PG-R-001 goal completeness | `nc-001-incomplete-goal.ttl` | Planning API (422) |
| PG-R-002 life expectancy provenance | `nc-002-unsourced-life-expectancy.ttl` | projection step (Calculator Management) |
| PG-R-003 projection validity | `nc-003-probability-out-of-range.ttl` | `rwm_pg_goal_progress` reads only valid projections |
| PG-R-004 retirement scenario completeness | `nc-002-unsourced-life-expectancy.ttl` (shared) | projection step |

Competency questions: CQ-001…CQ-005 come from the template; CQ-005 exercises `rwm_pg_goal_progress`.

## Open items

- Ask the capability-map owners to add Financial Planning and its children to the authoritative map.
- Replace placeholder role holders and policy/retention placeholders (`rules/`, `records/`).
- Add RML mappings from the planning platform (`mappings/`).
