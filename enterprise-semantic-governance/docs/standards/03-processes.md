# 03 · Processes

Enforced by: `ent-ms:BusinessProcessShape`, `ent-ms:ProcessStepShape`. Vocabulary: `ontology/process.ttl`.

Processes ground agents in *what happens, in what order, by whom, under which rules, touching which concepts, APIs and records*. They are not a replacement for BPMN. Where a BPMN model of record exists, link it with `ent-proc:bpmnReference`.

| Element | Property | Required |
|---|---|---|
| Process realizes a capability | `ent-av:realizesCapability` → capability map | ✔ |
| Ordered steps | `ent-proc:hasStep`, `ent-proc:stepOrder`, optional `ent-proc:precededBy` | ✔ |
| Who performs each step | `ent-proc:performedBy` (party role, system, or `ent-fab:AgentClass`) | ✔ |
| Degree of automation | `ent-proc:automationLevel` (Manual, SystemAutomated, AgentAssisted, CustomerSelfService) | ✔ |
| Data in and out | `ent-proc:usesConcept`, `ent-proc:producesConcept` → ontology classes | recommended |
| Rules applied | `ent-proc:appliesRule` → business rules | when applicable |
| APIs invoked | `ent-proc:invokesApi` → domain APIs | when applicable |
| Records created | `ent-proc:createsRecord` → record classes | when applicable |
| Human approval | `ent-proc:humanApprovalRequired true` | when applicable |

An **AgentAssisted** step must apply at least one rule that is published in a rule pack (CTL-005). The review board checks this.
