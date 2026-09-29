# Registering a new domain or sub-domain

1. **Confirm the domain in the capability map.** The business domain must exist in `enterprise-semantic-governance/capabilities` under its ontology domain. If it has no capabilities there, propose them in `capabilities/curation.yaml` (ADR-0004).
2. **Reserve a namespace.** Open a PR against `registry/domain-registry.ttl`:
   ```turtle
   ent-reg:<code> a ent-gov:DomainRegistration ;
       rdfs:label "<business domain name>"@en ;
       ent-gov:registersDomain <{base}capability/domain/<ontology-domain-slug>/<domain-slug>> ;
       ent-gov:domainCode "<code>" ;
       ent-gov:namespace "{base}domain/<ontology-domain-slug>/<domain-slug>/"^^xsd:anyURI ;
       ent-gov:codeRepository "https://github.com/example-org/<repo>"^^xsd:anyURI ;
       ent-gov:registrationStatus "Provisional" .
   ```
   The semantic review board approves it.
3. **Scaffold the repository** from `domain-template`:
   ```bash
   python domain-template/scripts/new_domain.py --answers my-domain.yaml --out ../<repo>
   # or, with Copier installed:  copier copy domain-template ../<repo>
   ```
4. **Fill in the domain manifest** (accountable roles and review teams) and run `semtool codeowners`.
5. **Model a first slice**, get CI green (gates G1–G7), then request semantic review.
6. **Publish modules for reuse** by adding `ent-gov:publishedModule` to your registration, once another domain needs them. Also add an import to the ontology domain's umbrella in `ontology/ontology-domains/`.
