# 07 · Cross-domain alignment

Owner: semantic review board. Register: `alignment/alignment-register.ttl`. Axioms: `fibo-extensions/ontology/alignment/`.

Domains own their meaning. When two domains' terms overlap, **neither domain edits the other's ontology**. Instead:

1. Either domain, or the board, opens an alignment issue.
2. The board facilitates, and both domain owners agree an outcome:
   - **Equivalent**: the same concept. Promote it to enterprise core (`fibo-ext/core/`) and make both domain terms subclasses of it, or deprecate one.
   - **Specialization**: one is a narrower kind of the other. Add a `rdfs:subClassOf` axiom in the alignment module.
   - **Related, not equivalent**: look-alike terms that must not be conflated. Record the decision; agents treat them as distinct (CTL-007).
   - **Conflict**: unresolved. Record the conflict; retrieval marks both terms as disputed.
3. The decision is recorded as an `ent-gov:AlignmentDecision` in the register, naming the consulted domains. Any axioms go in `fibo-extensions/ontology/alignment/`, never inside either domain.

Promoting a term to enterprise core does not transfer ownership of its meaning. Core terms name an owning domain with `ent-av:owningDomain`.
