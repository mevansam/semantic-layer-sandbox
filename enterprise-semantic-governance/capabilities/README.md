# Capability map

The capability map governs the semantic model. It says which **business domain** (and sub-domain) is accountable for each **capability**, which **data ontology** that domain maintains, and which **taxonomy nodes** each capability touches.

| File | What |
|---|---|
| `capability-map.provisional.csv` | **Provisional** seed map (ADR-0003). Used until the authoritative map is added. |
| `capability-map.csv` / `.xlsx` | The authoritative map. When present, it takes precedence automatically. |
| `columns.yaml` | Maps the importer's fields to your file's column headers. |
| `capability-map.ttl` | **Generated.** Capabilities (SKOS), plus business domains and sub-domains (`ent-gov:BusinessDomain`/`SubDomain`) with their data ontology and capabilities. |

```bash
python tools/semtool.py capabilities                   # picks csv/xlsx, else provisional
python tools/semtool.py capabilities --source ~/Downloads/capability-map.xlsx
```

Taxonomy anchors can be given as taxonomy local names (`customers.customer-profile`), notations (`T.01.02`) or exact labels. Labels are ambiguous for repeated names such as "Account Transactions", so local names are preferred.
