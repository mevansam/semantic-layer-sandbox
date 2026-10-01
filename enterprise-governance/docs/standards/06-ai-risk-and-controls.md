# 06 · AI risks and controls

Owner: AI risk office. Catalog: `ontology/controls.ttl`. Framework mappings (NIST AI RMF, ISO/IEC 42001) are **placeholders** until they are mapped to the enterprise control framework.

## Controls

| Control | What | Enforcement point |
|---|---|---|
| CTL-001 | Answer only from governed collections the agent is entitled to | retrieval runtime |
| CTL-002 | Cite collection@version plus term and rule ids | agent response contract |
| CTL-003 | Serve only the current released version | KG publication pipeline |
| CTL-004 | No Confidential or Restricted knowledge to external models or training | CI publication gate, retrieval runtime |
| CTL-005 | Regulated-boundary rule pack checks outputs before delivery | agent runtime |
| CTL-006 | Execution models need a risk assessment and traceability to rules | CI publication gate |
| CTL-007 | Combine cross-domain terms only through alignment decisions | retrieval runtime |
| CTL-008 | Retain agent-delivered outcomes as records with rule, data and model versions | runtime plus domain records |

## What CI enforces today

- Collections must reference CTL-001 and have a sensitivity class, ODRL policy and approved risk assessment (`ent-ms:KnowledgeCollectionShape`).
- Execution models must reference CTL-006, a risk assessment, a grounding collection and a source rule or process (`ent-ms:ExecutionModelShape`).

## Risk assessments

Each assessment (`ent-ctl:RiskAssessment`) records:
- the collection or execution model assessed
- the risks identified
- the residual rating
- the approving AI risk owner
- the approval date

Assessments are stored with the domain asset they cover, because the domain is accountable for the asset. The approver is always the enterprise AI risk office.
