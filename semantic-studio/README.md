# Semantic Studio

A web view of the semantic layer: domains, concepts, rules, processes, APIs, data, records, the capability map, the taxonomy, FIBO, gate results, decisions and documents, with search and SPARQL.

This first release is **Explore** mode, which is read-only. Everything it shows is generated from the repositories at one commit, so it cannot disagree with them. Changes still go through pull requests and the gates. See [ADR-0008](../enterprise-semantic-governance/docs/adr/0008-semantic-studio.md).

## Run it

From the repository root:

```bash
make studio-serve     # export + build, then http://localhost:8787/  (needs Node >= 20)
make studio-docker    # the same in Docker: no Node needed
make studio-fresh     # run verify, hermit and selftest first, so the Health page is current
```

| Target | Does |
|---|---|
| `make studio` | export the data and build the site into `semantic-studio/build/site/` |
| `make studio-data` | export the data only (`build/site/data/`) |
| `make studio-serve` | `studio`, then serve the site with SPARQL (`STUDIO_PORT=8787`) |
| `make studio-docker` | `studio-data` (with the usual Python setup), then build the `semantic-studio` image (Node runs inside it) and run it on `127.0.0.1` |
| `make studio-fresh` | `verify`, `hermit`, `selftest`, then `studio`; the studio is built even if a check fails, so you can see what failed |
| `make clean-studio` | remove `build/` and `node_modules/` |

`make` installs the JavaScript dependencies into `node_modules/` the first time, and again whenever `package.json` changes. Python, FIBO and everything else come from the usual automatic setup.

### On an internal static host

Copy `semantic-studio/build/site/` to any static web server; it uses hash URLs, so no rewrite rules are needed. Everything works without a server except SPARQL. For SPARQL, either:
- serve the whole site with the server instead (the container, or `studio_server.py --host 0.0.0.0`), or
- run the server somewhere and allow the static site's origin to query it: `studio_server.py --cors-origin https://<static-host>`. Then set `sparqlEndpoint` in `build/site/config.json` to its `/sparql` URL.

Setting it to `""` hides the SPARQL page's query box.

## What is where

| Page | Shows |
|---|---|
| Overview | counts, the layers (enterprise, shared extensions, domains), business domains per ontology domain, what needs attention, recent decisions |
| Domains | every repository; the domain register from the capability map, with which domains are modelled |
| A domain | **sub-domains:** ownership, anchors, dependencies, meaning, rules and their tests, processes, APIs and agent tools, data, records, knowledge collections and agent cards, competency questions (run them), health, files. **Other repositories:** overview, health, files |
| A term (`#/r/<IRI>`) | any class, property, rule, API, capability, taxonomy concept or FIBO term: definition, example, agent guidance, lineage, properties, rules, where it is used, the agent card, where it is defined |
| Capability map, Taxonomy | filterable trees, with what realises or is governed by each entry |
| FIBO | the 12 modules of the enterprise profile, what builds on each, and every FIBO term in use |
| Graph | how repositories build on each other and on FIBO (or each ontology separately); the neighbourhood of any term |
| Governance | gates, decisions (ADRs), framework guide, standards, AI controls, alignment decisions, meta-shapes, known upstream defects |
| Health | gate matrix (G1-G8, HermiT, drift, template), every warning and failure, self-test, upstream defects |
| Docs | every markdown document, with Mermaid diagrams and working links |
| SPARQL | queries over everything; examples and every competency question; CSV/JSON download |

Press **Ctrl K** (or **/**) anywhere to search. The **Technical detail** switch adds IRIs, prefixes and raw triples.

## How it works

```
repositories ──▶ exporter/export_site_data.py ──▶ build/site/data/   meta, graph, docs, cards, health (JSON),
   + build/reports/*.json                                           kg.trig, files/
     (make verify, hermit, selftest)
src/ (React + TypeScript) ──▶ build.mjs (esbuild) ──▶ build/site/   index.html, assets/, config.json
                                     server/studio_server.py ──▶ build/site + /sparql (rdflib, read-only)
```

- **Exporter** (Python, imports `semtool`). It loads:
  - every governed RDF file of every repository, tagged with its file
  - the 12 FIBO profile modules, from the pinned checkout
  - FIBO/OMG labels and parents from domain closures, where `make verify` has built them
  - the markdown documents, the agent cards and the run reports

  It also runs drift (G8) and template alignment at export time.
- **Site** (React 19, TypeScript, esbuild). It loads `data/*.json` once and indexes the graph in the browser; pages are views over it.
  - Cytoscape.js draws the graphs and Mermaid draws the diagrams in documents. Both load only on pages that need them.
  - There are no external requests: fonts are IBM Plex when installed, system fonts otherwise.
- **Server** (Python standard library + rdflib). It serves the site and `/sparql`. In `data/kg.trig` each source file is a named graph (`urn:x-semantic-studio:file/<path>`); the default graph is their union.
  - **Queries only.** SPARQL Update, `SERVICE` and `FROM`/`FROM NAMED` are rejected, so a query can't reach files or URLs outside the graph.
  - **Limits.** Queries have a time limit (`--timeout`, 30 s) and a row cap (`--max-rows`, 5000). A query that runs past the limit gets an error, but it holds one of four workers until it finishes.
  - **Who can call it.** Only the same origin, unless `--cors-origin` names another. It is meant for a team, not as a public endpoint.

### Developing

```bash
make studio-data                    # once, and whenever the repositories change
cd semantic-studio && npm run dev   # rebuilds on change, http://localhost:5173/
```

The dev server serves the site but not `/sparql`. To query while developing, run `make studio-serve` in another terminal and set `"sparqlEndpoint": "http://localhost:8787/sparql"` in `build/site/config.json`. `npm run typecheck` runs TypeScript.

To show a new kind of asset in its own section, add it to `src/model.ts` (kinds) and to the relevant page in `src/pages/`. Anything not given a section still shows up on its term page, with all its facts and references.
