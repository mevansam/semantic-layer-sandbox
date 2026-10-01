# ADR-0008: Semantic Studio, a read-only web view generated from the repositories

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Semantic review board
- **Change class:** Enterprise tooling (additive)

## Context
The framework is navigable only through files, Turtle and `make` output. That works for ontology engineers but not for the other people it serves:
- business owners, who need to see what their domain owns and who is accountable
- the review board, who need gate results and decisions in one place
- agent developers, who need the card an agent retrieves and the tool that serves it
- newcomers, who need to see how the taxonomy, capability map, FIBO and the domains fit together

The view must not become a second source of truth. Domains keep owning their files, every change still goes through pull requests and gates, and the view must never disagree with the repository.

## Decision
1. **A separate tool at the repository root, `semantic-studio/`.** The name leaves room for editing later. The first release is the read-only **Explore** mode.
2. **Generated, never edited.** `make studio` exports everything the site shows from the repositories at one commit (`semantic-studio/exporter/export_site_data.py`), then builds a static site. The site never reads the repositories directly and shows the commit it was built from.
3. **Health comes from the checks themselves.** `semtool` writes a machine-readable report of every check run to `build/reports/<command>.json`, and `make selftest` writes `build/reports/selftest.json`. The export reads those reports, and runs drift (G8) and template alignment itself. Reports from an older commit are marked as such.
4. **SPARQL through a small read-only server.** `semantic-studio/server/studio_server.py` serves the site and a `/sparql` query endpoint over the exported graph, using only the standard library and rdflib (already a requirement).
   - Updates, `SERVICE` and `FROM` are rejected, so a query cannot reach files or URLs outside the graph.
   - Queries are time-limited and capped.
   - Cross-origin calls are allowed only from an origin that is configured.
5. **Two ways to run it.**
   - Locally: `make studio-serve` needs Node 20 or later to build the site.
   - In Docker: `make studio-docker` needs Docker instead of Node; Node runs inside the image. The data is still exported locally with the usual Python setup.
   - On an internal static host: copy `semantic-studio/build/site/`. Queries then need the server, or `sparqlEndpoint` in `config.json` pointing at one.
6. **Audience.** Pages lead with labels and definitions for business readers. A *Technical detail* switch adds IRIs, prefixes and raw triples.
7. **FIBO in full.** All 12 modules of the enterprise profile are loaded and browsable, whether or not a domain uses them yet.

## Consequences
- The view is only as current as its last export, and its Health page only as current as the last `make verify` / `hermit` / `selftest`. Reports from another commit, or older than a change to the repository's files, are marked as such. `make studio-fresh` runs the checks first.
- `make verify-domains` and `make hermit` now check every repository before failing, so each one has a current report.
- New vocabulary in the governance model (a new kind of asset) shows up generically, as a term with its facts and references. A dedicated page section needs a change in `semantic-studio/src/`.
- Editing, the planned **Propose** mode, will open pull requests rather than write files, so the gates and two-key review (ADR-0002) stay the only way in. That needs its own ADR.

## Alternatives considered
- **A triple store with a generic browser (for example Fuseki or GraphDB).** Rejected for now: such a browser shows triples, but not ownership, gates, processes or documents, and it adds a server to run and secure.
- **SPARQL in the browser (Oxigraph WebAssembly).** It would keep a static host fully self-contained. It was deferred because the server needs no extra dependency and loads the graph in under a second. It can be added later behind the same `sparqlEndpoint` setting.
- **Generating the site inside `semtool`.** Rejected to keep `semtool` focused on checks. The exporter imports `semtool` and reuses its repository model.
