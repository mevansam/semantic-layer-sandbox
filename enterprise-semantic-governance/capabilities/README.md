# Capability map

The capability map governs the semantic model. It gives:
- **ontology domains**: the named data ontologies (8)
- the **business (API) domains** in each ontology domain (38)
- the **capability hierarchy** (L1–L4) those domains realize

| File | What |
|---|---|
| `source/capability-map.csv` | The authoritative map, **verbatim**. Never edit it; fixes go to the map owners. |
| `columns.yaml` | Maps the importer's fields to the source column headers. |
| `curation.yaml` | **Curation rules** (ADR-0004): anchor aliases, technology nodes, suspicious placements, proposed capabilities. |
| `taxonomy-crosswalk.csv` | Domain → enterprise taxonomy nodes (status *proposed* until confirmed by domain owners). |
| `capability-map.ttl` | **Generated.** Ontology domains, business domains, curated capability tree with accountable domains. |
| `data-quality-report.md` | **Generated.** Kept and excluded mappings with reasons, placements not imported, proposed capabilities, capability gaps. Send it to the map owners. |

```bash
python tools/semtool.py capabilities                 # re-import after any change to source or curation
```

## Curation in one paragraph

A domain keeps a capability mapping only where the mapped path contains the domain's *own* capability: the same name, or a reviewed alias. The deepest such node is its anchor, and the domain is accountable for that node's sub-tree. Everything else is a copied tree and is excluded. Technology groupings are imported but can't be used as anchors. Placements that look wrong are not imported. Domains with no capabilities can propose them, and proposals are marked as such.
