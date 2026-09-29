# Capability map: data-quality report (GENERATED)

Source: `capabilities/source/capability-map.csv` (308 rows). Rules: `capabilities/curation.yaml` (ADR-0004).

| | Count |
|---|---|
| Ontology domains imported | 8 |
| Business domains imported | 38 |
| Capability nodes in source | 134 |
| Business capability nodes imported | 121 |
| Technology nodes (typed, not anchorable) | 13 |
| Domain→capability mappings kept (anchors) | 9 |
| Domain→capability rows excluded | 157 |
| Proposed capabilities (not in source) | 6 |
| Domains with no capability (gap) | 27 |

## Kept mappings (domain → anchor capability; accountable for its sub-tree)

| Domain | Ontology domain | Anchor capability |
|---|---|---|
| Benefits Management | Planning and Guidance | Benefits Management |
| Brokerage Asset Servicing | Investment Servicing | Brokerage Recordkeeping Services |
| Charitable Giving | Other | Charitable Giving |
| Digital Assets | Markets and Money | Investment Management > Digital Asset Management |
| Investment Management | Investment Servicing | Investment Management |
| Investment Operations | Investment Servicing | Investment Operations |
| Market Data Management | Markets and Money | Investment Operations > Market Data Management |
| Portfolio Management | Investment Servicing | Investment Management > Portfolio Management |
| Retail Brokerage Services | Investment Servicing | Retail Brokerage Services |

## Excluded mappings (copied capability trees that do not belong to the domain)

| Domain | Rows excluded | Capability trees (L1) |
|---|---|---|
| Digital Assets | 16 | Investment Management |
| Employer Management | 38 | Benefits Management |
| Market Data Management | 11 | Investment Operations |
| Plan Management | 38 | Benefits Management |
| Portfolio Management | 16 | Investment Management |
| Product & Services | 38 | Benefits Management |

## Ontology-domain placements not imported (suspicious)

| Domain | Source placement | Reason |
|---|---|---|
| Legal, Risk, Compliance & Surveillance | Employee Operations | Employee Operations is a workforce grouping; legal, risk, compliance & surveillance is an enterprise control function |
| Finance, Accounting, & Procurement | Employee Operations | corporate finance is not an employee-operations concern |
| Product & Services | Planning and Guidance | only mapped to benefits capabilities, which belong to Benefits Management |

## Sub-domains (defined by the enterprise; the source map has none)

| Business domain | Sub-domain | Note |
|---|---|---|
| Retail Wealth Management | Planning and Guidance | Name coincides with the capability map's ontology domain 'Planning and Guidance'; they are different things (this is a sub-domain of Retail Wealth Management). |
| Retail Wealth Management | Insights and Analytics |  |

## Proposed capabilities (to add to the authoritative map)

| Domain | Capability |
|---|---|
| Retail Wealth Management | Financial Planning |
| Retail Wealth Management > Planning and Guidance | Financial Planning > Goal-Based Planning |
| Retail Wealth Management > Planning and Guidance | Financial Planning > Retirement Income Projection |
| Retail Wealth Management > Insights and Analytics | Financial Planning > Planning Insights & Analytics |
| Financial Assessments | Financial Assessment |
| Financial Assessments | Financial Assessment > Financial Wellness Assessment |

## Capability gaps (domains with no business capability in the map)

- Account Management and Recordkeeping (Investment Servicing)
- Calculator Management (Investment Servicing)
- Common Reference Data (Other)
- Communication Management (Customer Management)
- Contact Center Management (Other)
- Content Management (Customer Management)
- Customer Management (Customer Management)
- Cyber & Security Services (Technology Management)
- Document Management (Other)
- Employer Management (Employee Operations)
- Experience Management (Other)
- Finance, Accounting, & Procurement (unplaced)
- Financial Plan Management (Planning and Guidance)
- Financial Profile Management (Investment Servicing)
- Household Management (Planning and Guidance)
- Human Resources & Workforce Management (Employee Operations)
- Identity & Access Management (Technology Management)
- Institution Management (Institutional Servicing)
- Investment Professionals Management (Institutional Servicing)
- Legal, Risk, Compliance & Surveillance (unplaced)
- Marketing and Offer Management (Planning and Guidance)
- Money Movement (Markets and Money)
- Plan Management (Planning and Guidance)
- Product & Services (unplaced)
- Profiling Management (Investment Servicing)
- Tech & Service Management (Technology Management)
- Trade Management (Investment Servicing)
