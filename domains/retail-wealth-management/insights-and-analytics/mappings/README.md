# Mappings (RML)

Put RML mappings from physical sources (tables, APIs, files) to this domain's ontology here, one file per source dataset: `<source>.rml.ttl`.

Each mapping file must:
- name the data product it populates (`dct:isPartOf` the `dcat:Dataset` in `stewardship/`)
- use only terms from this domain's ontology, enterprise core, or the FIBO profile
- come with a small sample of source data and the expected RDF output, so CI can check the mapped output against `rules/`

Mappings are owned by the **data steward** (see CODEOWNERS).
