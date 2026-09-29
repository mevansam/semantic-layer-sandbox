# FIBO extension rules

These rules let many domains extend FIBO independently without fragmenting it.

| # | Rule | Why | Enforced by |
|---|---|---|---|
| E1 | **No statements about FIBO or OMG terms.** No added labels, definitions, superclasses or restrictions on a FIBO IRI. | FIBO stays FIBO. Upgrades don't conflict, and agents see one meaning per FIBO term. | `semtool extensions` |
| E2 | **Mint IRIs only in your registered namespace.** | Ownership is visible from the IRI, and no two domains mint the same term. | `semtool extensions` + registry |
| E3 | **Import only**: the enterprise FIBO profile or its modules, enterprise governance and core modules, and other domains' *published* modules. | Controls the reasoning footprint and inter-domain coupling. | `semtool extensions` |
| E4 | **Every business class specializes FIBO or enterprise core**, and is anchored to a taxonomy node. | "Based on FIBO" and "governed by the taxonomy" become checkable. | `meta-business.ttl` |
| E5 | **Choose the most specific correct FIBO parent.** When none fits, use the closest one and add `skos:editorialNote "FIBO-GAP: …"`. | Records FIBO gaps for upstream contribution. | semantic review |
| E6 | **Terms shared by several domains move to enterprise core** after an alignment decision, and keep one owning domain. | Avoids duplicated meaning without centralizing ownership. | semantic review |
| E7 | **Restrictions (OWL) express meaning; SHACL expresses rules.** Don't encode business policy thresholds as OWL axioms. | OWL is open-world and inferential; business rules are closed-world checks owned by rule owners. | semantic review |

## Patterns

```turtle
# Specialize a FIBO class (E1, E4)
sdp:FinancialGoal a owl:Class ;
    rdfs:subClassOf fibo-fnd-gao-obj:FinancialObjective ;
    ent-av:governedBy ent-tax:customers.customer-intelligence-and-analytics.customer-financial-goals-and-plans .

# Specialize a FIBO property
sdp:hasPlanGoal a owl:ObjectProperty ;
    rdfs:subPropertyOf fibo-fnd-gao-obj:hasObjective .   # only if the FIBO semantics truly apply

# NEVER (violates E1):
# fibo-fnd-gao-obj:FinancialObjective rdfs:label "goal" .
```
