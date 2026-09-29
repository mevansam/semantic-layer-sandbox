# Registering a business domain or sub-domain

1. **Confirm the domain in the capability map.** The business domain must exist in `enterprise-semantic-governance/capabilities`. Declare its sub-domains in `capabilities/curation.yaml` (`sub_domains`, ADR-0005) and propose capabilities for any that have none (ADR-0004). Register the business domain itself too (its namespace `{base}domain/<business-domain>/` holds the parent layer).
2. **Reserve a namespace.** Open a PR against `registry/domain-registry.ttl`:
   ```turtle
   ent-reg:<code> a ent-gov:DomainRegistration ;
       rdfs:label "<business domain> - <sub-domain>"@en ;
       ent-gov:registersDomain <{base}capability/domain/<ontology-domain>/<business-domain>/<sub-domain>> ;
       ent-gov:domainCode "<code>" ;
       ent-gov:namespace "{base}domain/<business-domain>/<sub-domain>/"^^xsd:anyURI ;
       ent-gov:codeRepository "https://github.com/example-org/<repo>"^^xsd:anyURI ;
       ent-gov:registrationStatus "Provisional" .
   ```
   The semantic review board approves it.
3. **Scaffold the repository** from `domain-template`:
   ```bash
   python domains/domain-template/scripts/new_domain.py --answers my.yaml --out domains/<business-domain>/<sub-domain>
   # or, with Copier installed:  copier copy domains/domain-template domains/<business-domain>/<sub-domain>
   # (the business domain's parent layer is scaffolded on first use)
   ```
4. **Fill in the domain manifest** (accountable roles and review teams) and run `semtool codeowners`.
5. **Model a first slice**, get CI green (gates G1–G7), then request semantic review.
6. **Publish modules for reuse** by adding `ent-gov:publishedModule` to your registration, once another domain needs them. Also add it to the business domain's umbrella (`domains/<business-domain>/domain.ttl`).
