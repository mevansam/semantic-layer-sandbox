# 02 · Business rules

Owner of the standard: semantic review board. Owner of each rule: the rule owner named on the rule. Enforced by: `ent-ms:BusinessRuleShape`, `semtool rules`.

A business rule has two forms, and both are required:

| Form | Property | Purpose | Who reads it |
|---|---|---|---|
| **Authoritative statement** | `ent-av:ruleStatement` | What the rule means, in the words the rule owner approved | People; agents explaining a rule |
| **Executable shape** | SHACL (`sh:NodeShape` typed `ent-gov:BusinessRule`) | How the rule is checked | CI; rule packs at agent runtime |

If they disagree, the statement is right and the shape is a defect.

## Required metadata

```turtle
ia-rule:AdviceBoundaryRule
    a sh:NodeShape , ent-gov:BusinessRule ;
    ent-av:ruleIdentifier "IA-R-001" ;
    ent-av:ruleStatement  "A self-directed insight must not recommend buying or selling a specific security." ;
    ent-av:policySource   "Retail advice boundary policy RP-ADV-004 (placeholder)" ;
    ent-gov:hasRuleOwner  ia-m:RuleOwnerRole ;
    ent-av:governedBy     ent-tax:products-and-services.personalized-planning-and-guidance-services ;
    sh:targetClass ia:SelfDirectedInsight ;
    sh:message "…" ;
    … .
```

## Conventions

- **One rule, one shape, one identifier** (`{PREFIX}-R-{nnn}`, numbered per sub-domain, e.g. `FP-R-001`, `IA-R-001`). Don't bundle unrelated constraints into one shape.
- Use core SHACL first. Use SHACL-SPARQL (`sh:sparql`) only when core SHACL cannot express the rule, and explain why in `skos:editorialNote`.
- Reuse fabric shapes (`fabric/reusable-assets/`) with `sh:node` instead of rewriting them.
- Every rule has at least one **negative test case**: an example that must violate it, listed in `tests/negative/expectations.yaml`.
- Severity: `sh:Violation` blocks the business outcome; `sh:Warning` flags it for review; `sh:Info` is advisory only.
- Rules used by an agent at runtime are published as a **rule pack** execution model (standard 08). An agent never re-implements a rule in its prompt.
